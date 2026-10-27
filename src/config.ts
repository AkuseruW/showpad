type Environment = Readonly<Record<string, string | undefined>>;

export function readSettings(env: Environment = process.env) {
  const storage = env.STORAGE ?? "memory";
  if (storage !== "memory" && storage !== "redis") {
    throw new Error("STORAGE must be memory or redis");
  }

  const rawPort = env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port > 65535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }

  const host = env.HOST ?? "127.0.0.1";
  if (host.trim().length === 0) throw new Error("HOST must not be empty");

  const redisUrl = env.REDIS_URL ?? "redis://127.0.0.1:6379";
  if (storage === "redis") {
    let url: URL;
    try {
      url = new URL(redisUrl);
    } catch {
      throw new Error("REDIS_URL must be a valid Redis URL");
    }
    if (!["redis:", "rediss:"].includes(url.protocol) || !url.hostname) {
      throw new Error(
        "REDIS_URL must use redis:// or rediss:// with a hostname",
      );
    }
  }

  return { storage, host, port, redisUrl, clientsFile: env.CLIENTS_FILE };
}
