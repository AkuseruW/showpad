import type { RateLimitPolicy } from "../clients";
import type { CounterState, StateChange } from "./types";

export function tokenBucket(
  state: CounterState | undefined,
  policy: RateLimitPolicy,
  now: number,
): StateChange {
  const previous = state?.kind === "token-bucket" ? state : undefined;
  const updatedAt = Math.max(now, previous?.updatedAt ?? now);
  const elapsed = BigInt(updatedAt - (previous?.updatedAt ?? updatedAt));
  const rate = BigInt(policy.limit);
  const cost = BigInt(policy.windowMs);
  const capacity = rate * cost;
  const accrued = BigInt(previous?.credit ?? capacity) + elapsed * rate;
  const credit = accrued < capacity ? accrued : capacity;
  const allowed = credit >= cost;
  const remaining = credit - (allowed ? cost : 0n);
  const duration = (amount: bigint) => Number((amount + rate - 1n) / rate);
  const clockOffset = updatedAt - now;

  return {
    state: { kind: "token-bucket", credit: remaining.toString(), updatedAt },
    ttlMs: Math.max(1, duration(capacity - remaining) + clockOffset),
    decision: {
      allowed,
      retryAfterMs: allowed ? 0 : duration(cost - credit) + clockOffset,
    },
  };
}
