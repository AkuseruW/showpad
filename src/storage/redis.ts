import { setTimeout } from "node:timers/promises";
import type { RedisClientType } from "redis";
import type {
  CounterState,
  CounterStore,
  Decision,
  StateTransition,
} from "../rate-limit/types";

type RedisConnection = {
  withAbortSignal(signal: AbortSignal): Pick<RedisClientType, "get" | "eval">;
};

const MAX_BACKOFF_MS = 50;

const compareAndSet = `
local current = redis.call("GET", KEYS[1])
if (current or "") ~= ARGV[1] then
  return 0
end
redis.call("SET", KEYS[1], ARGV[2], "PX", ARGV[3])
return 1
`;

export class RedisStore implements CounterStore {
  constructor(
    private readonly client: RedisConnection,
    private readonly prefix = "showpad:v1:",
    private readonly timeoutMs = 2000,
  ) {}

  async update(key: string, transition: StateTransition): Promise<Decision> {
    const redisKey = this.prefix + key;
    const signal = AbortSignal.timeout(this.timeoutMs);
    const client = this.client.withAbortSignal(signal);
    let backoffMs = 1;

    try {
      while (true) {
        const value = await client.get(redisKey);
        const state =
          value === null ? undefined : (JSON.parse(value) as CounterState);
        const change = transition(state);
        const written = await client.eval(compareAndSet, {
          keys: [redisKey],
          arguments: [
            value ?? "",
            JSON.stringify(change.state),
            String(change.ttlMs),
          ],
        });

        if (written === 1) return change.decision;

        const delayMs = Math.floor(Math.random() * backoffMs) + 1;
        await setTimeout(delayMs, undefined, { signal });
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      }
    } catch (error) {
      if (signal.aborted) {
        throw new Error("Counter update timed out", { cause: error });
      }
      throw error;
    }
  }
}
