import type { RateLimitPolicy } from "../clients";
import type { CounterState, StateChange } from "./types";

export function fixedWindow(
  state: CounterState | undefined,
  policy: RateLimitPolicy,
  now: number,
): StateChange {
  const previous = state?.kind === "fixed-window" ? state : undefined;
  const windowStart = Math.max(
    Math.floor(now / policy.windowMs) * policy.windowMs,
    previous?.windowStart ?? 0,
  );
  const count = previous?.windowStart === windowStart ? previous.count : 0;
  const allowed = count < policy.limit;
  const ttlMs = Math.max(1, Math.ceil(windowStart + policy.windowMs - now));

  return {
    state: {
      kind: "fixed-window",
      windowStart,
      count: count + (allowed ? 1 : 0),
    },
    ttlMs,
    decision: { allowed, retryAfterMs: allowed ? 0 : ttlMs },
  };
}
