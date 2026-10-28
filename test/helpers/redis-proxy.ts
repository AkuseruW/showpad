import { once } from "node:events";
import { createConnection, createServer, type Socket } from "node:net";
import type { TestContext } from "node:test";

export async function redisProxy(t: TestContext) {
  const target = new URL(
    process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379",
  );
  const sockets = new Set<Socket>();
  const server = createServer((incoming) => {
    const outgoing = createConnection({
      host: target.hostname,
      port: Number(target.port) || 6379,
    });
    for (const socket of [incoming, outgoing]) {
      sockets.add(socket);
      socket.on("error", () => {});
      socket.once("close", () => {
        sockets.delete(socket);
        incoming.destroy();
        outgoing.destroy();
      });
    }
    incoming.pipe(outgoing).pipe(incoming);
  });
  let port = 0;

  async function start() {
    server.listen(port, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Redis proxy did not bind a TCP port");
    }
    port = address.port;
  }

  async function stop() {
    const closed = once(server, "close");
    server.close();
    for (const socket of sockets) socket.destroy();
    await closed;
  }

  t.after(async () => {
    if (server.listening) await stop();
  });
  await start();
  const url = new URL(target);
  url.hostname = "127.0.0.1";
  url.port = String(port);
  return { url: url.toString(), start, stop };
}
