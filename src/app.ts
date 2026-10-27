import Fastify, { type FastifyServerOptions } from "fastify";
import { type Clients, loadClients, parseClients } from "./clients";
import { fixedWindow } from "./rate-limit/fixed-window";
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

  for (const route of ["foo", "bar"] as const) {
    app.get(
      `/${route}`,
      {
        preHandler: async (request, reply) => {
          const id = /^Bearer +(\S+)$/i.exec(
            request.headers.authorization ?? "",
          )?.[1];

          if (id === undefined || !Object.hasOwn(clients, id)) {
            return reply
              .code(401)
              .header("WWW-Authenticate", "Bearer")
              .send({ error: "unauthorized" });
          }

          const client = clients[id];
          if (route === "foo" && client !== undefined) {
            try {
              const decision = await store.update(
                JSON.stringify([id, route]),
                (state) => fixedWindow(state, client[route], clock()),
              );

              if (!decision.allowed) {
                return reply
                  .code(429)
                  .header(
                    "Retry-After",
                    Math.ceil(decision.retryAfterMs / 1000),
                  )
                  .send({ error: "rate limit exceeded" });
              }
            } catch (error) {
              request.log.error({ err: error }, "Rate limiter unavailable");
              return reply
                .code(503)
                .send({ error: "rate limiter unavailable" });
            }
          }
        },
      },
      async () => ({ success: true }),
    );
  }

  return app;
}
