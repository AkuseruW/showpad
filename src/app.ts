import Fastify, { type FastifyServerOptions } from "fastify";
import { readFileSync } from "node:fs";
import { type Clients, loadClients, parseClients } from "./clients";
import { createAuthenticate } from "./hooks/authenticate";
import { createRateLimit } from "./hooks/rate-limit";
import { fixedWindow } from "./rate-limit/fixed-window";
import { tokenBucket } from "./rate-limit/token-bucket";
import type { CounterStore } from "./rate-limit/types";
import { MemoryStore } from "./storage/memory";

const demo = readFileSync(
  new URL("../public/index.html", import.meta.url),
  "utf8",
);

export type AppOptions = FastifyServerOptions & {
  clients?: Clients;
  clock?: () => number;
  store?: CounterStore;
};

export function buildApp(options: AppOptions = {}) {
  const {
    clients: input,
    clock = Date.now,
    store = new MemoryStore(),
    ...fastifyOptions
  } = options;
  const clients = input === undefined ? loadClients() : parseClients(input);
  const app = Fastify(fastifyOptions);

  app.decorateRequest("client", null);

  const authenticate = createAuthenticate(clients);
  const limitFoo = createRateLimit("foo", fixedWindow, store, clock);
  const limitBar = createRateLimit("bar", tokenBucket, store, clock);
  const success = async () => ({ success: true });

  app.get("/", async (_request, reply) => reply.type("text/html").send(demo));
  app.get("/foo", { preHandler: [authenticate, limitFoo] }, success);
  app.get("/bar", { preHandler: [authenticate, limitBar] }, success);

  return app;
}
