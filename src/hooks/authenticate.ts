import type { FastifyReply, FastifyRequest } from "fastify";
import type { ClientPolicies, Clients } from "../clients";

type AuthenticatedClient = {
  id: string;
  policies: ClientPolicies;
};

declare module "fastify" {
  interface FastifyRequest {
    client: AuthenticatedClient | null;
  }
}

export function createAuthenticate(clients: Clients) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const id = /^Bearer +(\S+)$/i.exec(
      request.headers.authorization ?? "",
    )?.[1];
    const policies =
      id !== undefined && Object.hasOwn(clients, id) ? clients[id] : undefined;

    if (id === undefined || policies === undefined) {
      return reply
        .code(401)
        .header("WWW-Authenticate", "Bearer")
        .send({ error: "unauthorized" });
    }

    request.client = { id, policies };
  };
}
