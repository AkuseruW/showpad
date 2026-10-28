import type { RateLimitPolicy } from "../clients";
import type { CounterState, StateChange } from "./types";

export function tokenBucket(
  state: CounterState | undefined,
  policy: RateLimitPolicy,
  now: number,
): StateChange {
  const previous = state?.kind === "token-bucket" ? state : undefined;
  const updatedAt = Math.max(now, previous?.updatedAt ?? now);
  const elapsedMs = BigInt(updatedAt - (previous?.updatedAt ?? updatedAt));
  const refillRate = BigInt(policy.limit);
  const tokenCost = BigInt(policy.windowMs);
  const capacity = refillRate * tokenCost;
  const refilledCredit =
    BigInt(previous?.credit ?? capacity) + elapsedMs * refillRate;
  const availableCredit = refilledCredit < capacity ? refilledCredit : capacity;
  const allowed = availableCredit >= tokenCost;
  const remainingCredit = availableCredit - (allowed ? tokenCost : 0n);
  const refillTimeMs = (credit: bigint) =>
    Number((credit + refillRate - 1n) / refillRate);
  const clockOffset = updatedAt - now;

  return {
    state: {
      kind: "token-bucket",
      credit: remainingCredit.toString(),
      updatedAt,
    },
    ttlMs: Math.max(1, refillTimeMs(capacity - remainingCredit) + clockOffset),
    decision: {
      allowed,
      retryAfterMs: allowed
        ? 0
        : refillTimeMs(tokenCost - availableCredit) + clockOffset,
    },
  };
}
