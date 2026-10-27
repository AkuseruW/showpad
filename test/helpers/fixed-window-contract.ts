import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type { FastifyInstance } from "fastify";

export type AppFactory = (
  t: TestContext,
  clock: () => number,
) => FastifyInstance | Promise<FastifyInstance>;

export const testClients = {
  "client-1": {
    foo: { limit: 3, windowMs: 1000 },
    bar: { limit: 3, windowMs: 1000 },
  },
  "client-2": {
    foo: { limit: 6, windowMs: 1000 },
    bar: { limit: 6, windowMs: 1000 },
  },
};

export function request(
  app: FastifyInstance,
  url = "/foo",
  client = "client-1",
) {
  return app.inject({
    method: "GET",
    url,
    headers: { authorization: `Bearer ${client}` },
  });
}

export function fixedWindowContract(name: string, createApp: AppFactory) {
  test(`${name}: /foo allows exactly the configured quota`, async (t) => {
    const app = await createApp(t, () => 100);

    for (let count = 0; count < 3; count++) {
      assert.equal((await request(app)).statusCode, 200);
    }
    const rejected = await request(app);

    assert.equal(rejected.statusCode, 429);
    assert.deepEqual(rejected.json(), { error: "rate limit exceeded" });
    assert.equal(rejected.headers["retry-after"], "1");
  });

  test(`${name}: /foo resets exactly at the next fixed boundary`, async (t) => {
    let now = 950;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app);

    now = 999;
    assert.equal((await request(app)).statusCode, 429);
    now = 1000;
    for (let count = 0; count < 3; count++) {
      assert.equal((await request(app)).statusCode, 200);
    }
    assert.equal((await request(app)).statusCode, 429);
  });

  test(`${name}: /foo keeps different client quotas independent`, async (t) => {
    const app = await createApp(t, () => 0);
    for (let count = 0; count < 3; count++) await request(app);
    assert.equal((await request(app)).statusCode, 429);

    for (let count = 0; count < 6; count++) {
      assert.equal((await request(app, "/foo", "client-2")).statusCode, 200);
    }
    assert.equal((await request(app, "/foo", "client-2")).statusCode, 429);
  });

  test(`${name}: concurrent /foo requests cannot exceed the quota`, async (t) => {
    const app = await createApp(t, () => 0);

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => request(app)),
    );

    assert.equal(
      responses.filter((response) => response.statusCode === 200).length,
      3,
    );
    assert.equal(
      responses.filter((response) => response.statusCode === 429).length,
      27,
    );
  });

  test(`${name}: rejected identities do not spend the /foo quota`, async (t) => {
    const app = await createApp(t, () => 0);
    assert.equal((await request(app, "/foo", "unknown")).statusCode, 401);

    for (let count = 0; count < 3; count++) {
      assert.equal((await request(app)).statusCode, 200);
    }
    assert.equal((await request(app)).statusCode, 429);
  });

  test(`${name}: moving the clock backwards cannot reopen a fixed window`, async (t) => {
    let now = 1200;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app);

    now = 900;
    assert.equal((await request(app)).statusCode, 429);
    now = 2000;
    assert.equal((await request(app)).statusCode, 200);
  });
}
