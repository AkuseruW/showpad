import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { createClient } from "redis";
import { buildApp } from "../../src/app";
import { RedisStore } from "../../src/storage/redis";
import {
  fixedWindowContract,
  request,
  testClients,
} from "../helpers/fixed-window-contract";
import { tokenBucketContract } from "../helpers/token-bucket-contract";

async function connect(
  t: TestContext,
  prefix = `showpad:test:${randomUUID()}:`,
) {
  const client = createClient({
    url: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
    disableOfflineQueue: true,
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  });
  client.on("error", (error: Error) => t.diagnostic(error.message));
  await client.connect();

  t.after(async () => {
    if (!client.isOpen) return;
    try {
      for await (const keys of client.scanIterator({ MATCH: `${prefix}*` })) {
        if (keys.length > 0) await client.unlink(keys);
      }
    } finally {
      client.destroy();
    }
  });

  return { client, prefix };
}

async function createApp(t: TestContext, clock: () => number) {
  const { client, prefix } = await connect(t);
  const app = buildApp({
    clients: testClients,
    clock,
    store: new RedisStore(client, prefix),
  });
  t.after(() => app.close());
  return app;
}

fixedWindowContract("redis", createApp);
tokenBucketContract("redis", createApp);

test("independent application instances share atomic quotas", async (t) => {
  const first = await connect(t);
  const second = await connect(t, first.prefix);
  const apps = [first, second].map(({ client, prefix }) => {
    const app = buildApp({
      clients: testClients,
      clock: () => 0,
      store: new RedisStore(client, prefix),
    });
    t.after(() => app.close());
    return app;
  });

  for (const url of ["/foo", "/bar"]) {
    const responses = await Promise.all(
      Array.from({ length: 60 }, (_, index) => request(apps[index % 2]!, url)),
    );

    assert.equal(
      responses.filter((response) => response.statusCode === 200).length,
      3,
    );
    assert.equal(
      responses.filter((response) => response.statusCode === 429).length,
      57,
    );
  }
});

test("quotas survive replacing the application and its Redis connection", async (t) => {
  const first = await connect(t);
  const original = buildApp({
    clients: testClients,
    clock: () => 0,
    store: new RedisStore(first.client, first.prefix),
  });

  for (const url of ["/foo", "/bar"]) {
    for (let count = 0; count < 3; count++) await request(original, url);
  }
  await original.close();
  first.client.destroy();

  const second = await connect(t, first.prefix);
  const replacement = buildApp({
    clients: testClients,
    clock: () => 0,
    store: new RedisStore(second.client, second.prefix),
  });
  t.after(() => replacement.close());

  for (const url of ["/foo", "/bar"]) {
    assert.equal((await request(replacement, url)).statusCode, 429);
  }
});

test("Redis expires counter state after its useful lifetime", async (t) => {
  const { client, prefix } = await connect(t);
  const policy = { limit: 1, windowMs: 100 };
  const app = buildApp({
    clients: { "client-1": { foo: policy, bar: policy } },
    clock: () => 0,
    store: new RedisStore(client, prefix),
  });
  t.after(() => app.close());

  for (const url of ["/foo", "/bar"]) {
    await request(app, url);
    const key = prefix + JSON.stringify(["client-1", url.slice(1), 1, 100]);
    const ttl = await client.pTTL(key);
    assert.ok(ttl > 0 && ttl <= 100);
    await setTimeout(150);
    assert.equal(await client.get(key), null);
  }
});

test("a disconnected Redis client returns 503 on both routes", async (t) => {
  const { client, prefix } = await connect(t);
  const app = buildApp({ store: new RedisStore(client, prefix) });
  t.after(() => app.close());
  client.destroy();

  for (const url of ["/foo", "/bar"]) {
    const response = await request(app, url);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "rate limiter unavailable" });
  }
});

test("changing a client's policy starts a quota for the new policy", async (t) => {
  const { client, prefix } = await connect(t);
  const original = buildApp({
    clients: testClients,
    clock: () => 0,
    store: new RedisStore(client, prefix),
  });
  t.after(() => original.close());
  for (const url of ["/foo", "/bar"]) {
    for (let count = 0; count < 3; count++) await request(original, url);
  }

  const policy = { limit: 6, windowMs: 1000 };
  const updated = buildApp({
    clients: { "client-1": { foo: policy, bar: policy } },
    clock: () => 0,
    store: new RedisStore(client, prefix),
  });
  t.after(() => updated.close());

  for (const url of ["/foo", "/bar"]) {
    for (let count = 0; count < 6; count++) {
      assert.equal((await request(updated, url)).statusCode, 200);
    }
    assert.equal((await request(updated, url)).statusCode, 429);
  }
});
