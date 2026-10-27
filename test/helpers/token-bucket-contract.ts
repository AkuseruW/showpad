import assert from "node:assert/strict";
import { test } from "node:test";
import { type AppFactory, request } from "./fixed-window-contract";

export function tokenBucketContract(name: string, createApp: AppFactory) {
  test(`${name}: /bar allows an initial burst up to capacity`, async (t) => {
    const app = await createApp(t, () => 0);
    for (let count = 0; count < 3; count++) {
      assert.equal((await request(app, "/bar")).statusCode, 200);
    }

    const rejected = await request(app, "/bar");

    assert.equal(rejected.statusCode, 429);
    assert.deepEqual(rejected.json(), { error: "rate limit exceeded" });
    assert.equal(rejected.headers["retry-after"], "1");
  });

  test(`${name}: /bar refills continuously between fixed boundaries`, async (t) => {
    let now = 0;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app, "/bar");

    now = 333;
    assert.equal((await request(app, "/bar")).statusCode, 429);
    now = 334;
    assert.equal((await request(app, "/bar")).statusCode, 200);
    now = 667;
    assert.equal((await request(app, "/bar")).statusCode, 200);
    now = 1000;
    assert.equal((await request(app, "/bar")).statusCode, 200);
    assert.equal((await request(app, "/bar")).statusCode, 429);
  });

  test(`${name}: /bar does not reset at a fixed-window boundary`, async (t) => {
    let now = 950;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app, "/bar");

    now = 1000;
    assert.equal((await request(app, "/bar")).statusCode, 429);
  });

  test(`${name}: idle time never grows /bar beyond its capacity`, async (t) => {
    let now = 0;
    const app = await createApp(t, () => now);
    await request(app, "/bar");

    now = 100000;
    for (let count = 0; count < 3; count++) {
      assert.equal((await request(app, "/bar")).statusCode, 200);
    }
    assert.equal((await request(app, "/bar")).statusCode, 429);
  });

  test(`${name}: /bar keeps different client capacities independent`, async (t) => {
    const app = await createApp(t, () => 0);
    for (let count = 0; count < 3; count++) await request(app, "/bar");
    assert.equal((await request(app, "/bar")).statusCode, 429);

    for (let count = 0; count < 6; count++) {
      assert.equal((await request(app, "/bar", "client-2")).statusCode, 200);
    }
    assert.equal((await request(app, "/bar", "client-2")).statusCode, 429);
  });

  test(`${name}: routes do not consume each other's quotas`, async (t) => {
    const app = await createApp(t, () => 0);

    for (const url of ["/foo", "/bar"]) {
      for (let count = 0; count < 3; count++) {
        assert.equal((await request(app, url)).statusCode, 200);
      }
      assert.equal((await request(app, url)).statusCode, 429);
    }
  });

  test(`${name}: concurrent /bar requests cannot exceed capacity`, async (t) => {
    const app = await createApp(t, () => 0);

    const responses = await Promise.all(
      Array.from({ length: 30 }, () => request(app, "/bar")),
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

  test(`${name}: moving the clock backwards cannot refill /bar`, async (t) => {
    let now = 1000;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app, "/bar");

    now = 900;
    assert.equal((await request(app, "/bar")).statusCode, 429);
    now = 1000;
    assert.equal((await request(app, "/bar")).statusCode, 429);
    now = 1334;
    assert.equal((await request(app, "/bar")).statusCode, 200);
  });

  test(`${name}: frequent rejected requests do not delay token refill`, async (t) => {
    let now = 0;
    const app = await createApp(t, () => now);
    for (let count = 0; count < 3; count++) await request(app, "/bar");
    const acceptedAt: number[] = [];

    for (now = 1; now <= 1000; now++) {
      if ((await request(app, "/bar")).statusCode === 200) acceptedAt.push(now);
    }

    assert.deepEqual(acceptedAt, [334, 667, 1000]);
  });
}
