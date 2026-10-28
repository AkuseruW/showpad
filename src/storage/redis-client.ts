import { createClient } from "redis";

export function createRedisClient(url: string) {
  let hasConnected = false;
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) => {
        if (!hasConnected) return false;
        return Math.min(100 * 2 ** retries, 2000);
      },
    },
  });
  client.once("ready", () => {
    hasConnected = true;
  });
  return client;
}
