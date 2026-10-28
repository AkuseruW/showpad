import { buildApp } from "./app";
import { loadClients } from "./clients";
import { readSettings } from "./config";
import { MemoryStore } from "./storage/memory";
import { RedisStore } from "./storage/redis";
import { createRedisClient } from "./storage/redis-client";

const settings = readSettings();
const redis =
  settings.storage === "redis"
    ? createRedisClient(settings.redisUrl)
    : undefined;

const app = buildApp({
  clients: loadClients(settings.clientsFile),
  store: redis === undefined ? new MemoryStore() : new RedisStore(redis),
  logger: { redact: ["req.headers.authorization"] },
});

redis?.on("error", (error: Error) =>
  app.log.error({ err: error }, "Redis error"),
);
app.addHook("onClose", async () => {
  if (redis?.isOpen) await redis.close();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void app.close().catch((error: unknown) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  });
}

try {
  await redis?.connect();
  await app.listen({ port: settings.port, host: settings.host });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
