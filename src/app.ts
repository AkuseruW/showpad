import Fastify, { type FastifyServerOptions } from "fastify";
import { type Clients, loadClients, parseClients } from "./clients";
import { createAuthenticate } from "./hooks/authenticate";
import { createRateLimit } from "./hooks/rate-limit";
import type { CounterStore } from "./rate-limit/types";
import { MemoryStore } from "./storage/memory";

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
  const limitFoo = createRateLimit("foo", store, clock);
  const limitBar = createRateLimit("bar", store, clock);
  const success = async () => ({ success: true });

  app.get("/foo", { preHandler: [authenticate, limitFoo] }, success);
  app.get("/bar", { preHandler: [authenticate, limitBar] }, success);

  return app;
}
