import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { buildApp } from "../src/app";
import { loadClients } from "../src/clients";
import { MemoryStore } from "../src/storage/memory";
import { RedisStore } from "../src/storage/redis";

const selection = process.argv[2] ?? "all";
if (!["all", "memory", "redis"].includes(selection)) {
  throw new Error("Usage: pnpm demo [all|memory|redis]");
}

const clients = loadClients();
const backends = selection === "all" ? ["memory", "redis"] : [selection];

for (const backend of backends) {
  const prefix = `showpad:demo:${randomUUID()}:`;
  const redis =
    backend === "redis"
      ? createClient({
          url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
          disableOfflineQueue: true,
          socket: { connectTimeout: 2000, reconnectStrategy: false },
        })
      : undefined;
  redis?.on("error", (error: Error) => console.error(error.message));
  const app = buildApp({
    clients,
    clock: () => 0,
    store:
      redis === undefined ? new MemoryStore() : new RedisStore(redis, prefix),
  });

  try {
    await redis?.connect();
    for (const [client, policies] of Object.entries(clients)) {
      for (const route of ["foo", "bar"] as const) {
        const statuses: number[] = [];
        for (let index = 0; index <= policies[route].limit; index++) {
          const response = await app.inject({
            method: "GET",
            url: `/${route}`,
            headers: { authorization: `Bearer ${client}` },
          });
          assert.equal(
            response.statusCode,
            index < policies[route].limit ? 200 : 429,
          );
          statuses.push(response.statusCode);
        }
        console.log(`${backend} ${client} /${route}: ${statuses.join(" ")}`);
      }
    }
  } finally {
    await app.close();
    if (redis?.isReady) {
      for await (const keys of redis.scanIterator({ MATCH: `${prefix}*` })) {
        if (keys.length > 0) await redis.unlink(keys);
      }
    }
    if (redis?.isOpen) await redis.close();
  }
}
