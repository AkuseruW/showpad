export type FixedWindowState = {
  kind: "fixed-window";
  windowStart: number;
  count: number;
};

export type TokenBucketState = {
  kind: "token-bucket";
  credit: string;
  updatedAt: number;
};

export type CounterState = FixedWindowState | TokenBucketState;

export type Decision = {
  allowed: boolean;
  retryAfterMs: number;
};

export type StateChange = {
  state: CounterState;
  ttlMs: number;
  decision: Decision;
};

export type StateTransition = (state: CounterState | undefined) => StateChange;

export interface CounterStore {
  update(key: string, transition: StateTransition): Promise<Decision>;
}
