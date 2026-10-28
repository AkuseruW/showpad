import type { FastifyReply, FastifyRequest } from "fastify";
import type { Route } from "../clients";
import type { CounterStore, RateLimitAlgorithm } from "../rate-limit/types";

export function createRateLimit(
  route: Route,
  algorithm: RateLimitAlgorithm,
  store: CounterStore,
  clock: () => number,
) {
  return async function rateLimit(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const client = request.client;
    if (client === null)
      throw new Error("Rate limiting requires an authenticated client");

    const policy = client.policies[route];
    try {
      const decision = await store.update(
        JSON.stringify([client.id, route, policy.limit, policy.windowMs]),
        (state) => algorithm(state, policy, clock()),
      );

      if (!decision.allowed) {
        return reply
          .code(429)
          .header("Retry-After", Math.ceil(decision.retryAfterMs / 1000))
          .send({ error: "rate limit exceeded" });
      }
    } catch (error) {
      request.log.error({ err: error }, "Rate limiter unavailable");
      return reply.code(503).send({ error: "rate limiter unavailable" });
    }
  };
}
