import Fastify, { type FastifyServerOptions } from "fastify";
import { type Clients, loadClients, parseClients } from "./clients";

export type AppOptions = FastifyServerOptions & { clients?: Clients };

export function buildApp(options: AppOptions = {}) {
  const { clients: input, ...fastifyOptions } = options;
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
        },
      },
      async () => ({ success: true }),
    );
  }

  return app;
}
