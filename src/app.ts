import Fastify, { type FastifyServerOptions } from "fastify";

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify(options);

  app.get("/foo", async () => ({ success: true }));
  app.get("/bar", async () => ({ success: true }));

  return app;
}
