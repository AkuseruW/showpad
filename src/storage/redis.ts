import type { RedisClientType } from "redis";
import type {
  CounterState,
  CounterStore,
  Decision,
  StateTransition,
} from "../rate-limit/types";

type RedisConnection = Pick<RedisClientType, "get" | "eval">;

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
  ) {}

  async update(key: string, transition: StateTransition): Promise<Decision> {
    const redisKey = this.prefix + key;

    for (let attempt = 0; attempt < 64; attempt++) {
      const value = await this.client.get(redisKey);
      const state =
        value === null ? undefined : (JSON.parse(value) as CounterState);
      const change = transition(state);
      const written = await this.client.eval(compareAndSet, {
        keys: [redisKey],
        arguments: [
          value ?? "",
          JSON.stringify(change.state),
          String(change.ttlMs),
        ],
      });

      if (written === 1) return change.decision;
    }

    throw new Error("Counter update exceeded the contention retry budget");
  }
}
