import { createClient } from "redis";

export function createRedisClient(url: string) {
  let connected = false;
  const client = createClient({
    url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 2000,
      reconnectStrategy: (retries) =>
        connected ? Math.min(100 * 2 ** Math.min(retries, 5), 2000) : false,
    },
  });
  client.once("ready", () => {
    connected = true;
  });
  return client;
}
