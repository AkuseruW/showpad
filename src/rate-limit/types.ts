export type CounterState = {
  kind: "fixed-window";
  windowStart: number;
  count: number;
};

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
