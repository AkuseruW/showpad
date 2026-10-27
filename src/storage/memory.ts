import type {
  CounterState,
  CounterStore,
  Decision,
  StateTransition,
} from "../rate-limit/types";

export class MemoryStore implements CounterStore {
  private readonly counters = new Map<string, CounterState>();

  async update(key: string, transition: StateTransition): Promise<Decision> {
    const change = transition(this.counters.get(key));
    this.counters.set(key, change.state);
    return change.decision;
  }
}
