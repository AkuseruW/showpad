import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { test, type TestContext } from "node:test";
import { createClient } from "redis";
import { buildApp } from "../../src/app";
import { RedisStore } from "../../src/storage/redis";
import { createRedisClient } from "../../src/storage/redis-client";
import {
  fixedWindowContract,
  request,
  testClients,
} from "../helpers/fixed-window-contract";
import { tokenBucketContract } from "../helpers/token-bucket-contract";
import { redisProxy } from "../helpers/redis-proxy";

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

test(
  "Redis reconnects after a lost connection and preserves both quotas",
  { timeout: 5000 },
  async (t) => {
    const { prefix } = await connect(t);
    const proxy = await redisProxy(t);
    const client = createRedisClient(proxy.url);
    client.on("error", () => {});
    t.after(() => {
      if (client.isOpen) client.destroy();
    });
    await client.connect();
    const policy = { limit: 3, windowMs: 60000 };
    const app = buildApp({
      clients: { "client-1": { foo: policy, bar: policy } },
      clock: () => 0,
      store: new RedisStore(client, prefix),
    });
    t.after(() => app.close());

    for (const url of ["/foo", "/bar"]) {
      for (let count = 0; count < 3; count++) await request(app, url);
    }
    const connectionId = await client.clientId();
    const disconnected = new Promise<void>((resolve) => {
      client.once("error", () => resolve());
    });
    await proxy.stop();
    await disconnected;

    for (const url of ["/foo", "/bar"]) {
      assert.equal((await request(app, url)).statusCode, 503);
    }

    await setTimeout(150);
    assert.equal(client.isReady, false);
    await proxy.start();
    const deadline = Date.now() + 3000;
    while (!client.isReady && Date.now() < deadline) await setTimeout(10);
    assert.ok(client.isReady, "Redis should reconnect after losing its socket");
    assert.notEqual(await client.clientId(), connectionId);

    for (const url of ["/foo", "/bar"]) {
      assert.equal((await request(app, url)).statusCode, 429);
    }
  },
);

test(
  "Redis rejects its first connection failure without retrying forever",
  { timeout: 5000 },
  async (t) => {
    const proxy = await redisProxy(t);
    await proxy.stop();
    const client = createRedisClient(proxy.url);
    client.on("error", () => {});
    t.after(() => {
      if (client.isOpen) client.destroy();
    });

    await assert.rejects(client.connect());
    assert.equal(client.isOpen, false);
  },
);

test(
  "closing Redis during an outage cancels reconnection",
  { timeout: 5000 },
  async (t) => {
    const proxy = await redisProxy(t);
    const client = createRedisClient(proxy.url);
    client.on("error", () => {});
    t.after(() => {
      if (client.isOpen) client.destroy();
    });
    await client.connect();
    const disconnected = new Promise<void>((resolve) => {
      client.once("error", () => resolve());
    });
    await proxy.stop();
    await disconnected;

    await client.close();
    await proxy.start();
    await setTimeout(250);

    assert.equal(client.isOpen, false);
    assert.equal(client.isReady, false);
  },
);

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

for (const url of ["/foo", "/bar"]) {
  test(`${url} admits 100 concurrent requests below a quota of 1000`, async (t) => {
    const { client, prefix } = await connect(t);
    const policy = { limit: 1000, windowMs: 60000 };
    const app = buildApp({
      clients: { "client-1": { foo: policy, bar: policy } },
      clock: () => 0,
      store: new RedisStore(client, prefix),
    });
    t.after(() => app.close());

    const responses = await Promise.all(
      Array.from({ length: 100 }, () => request(app, url)),
    );

    assert.equal(
      responses.filter((response) => response.statusCode === 200).length,
      100,
    );
  });

  test(`${url} enforces a quota of 100 across 200 concurrent requests and two instances`, async (t) => {
    const first = await connect(t);
    const second = await connect(t, first.prefix);
    const policy = { limit: 100, windowMs: 60000 };
    const apps = [first, second].map(({ client, prefix }) => {
      const app = buildApp({
        clients: { "client-1": { foo: policy, bar: policy } },
        clock: () => 0,
        store: new RedisStore(client, prefix),
      });
      t.after(() => app.close());
      return app;
    });

    const responses = await Promise.all(
      Array.from({ length: 200 }, (_, index) => request(apps[index % 2]!, url)),
    );

    assert.equal(
      responses.filter((response) => response.statusCode === 200).length,
      100,
    );
    assert.equal(
      responses.filter((response) => response.statusCode === 429).length,
      100,
    );
  });
}
