import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { fixedWindow } from "../src/rate-limit/fixed-window";
import { RedisStore } from "../src/storage/redis";

test("permanent counter conflicts terminate within the update deadline", async () => {
  const store = new RedisStore(
    {
      withAbortSignal: () => ({
        get: async () => null,
        eval: async () => 0,
      }),
    },
    undefined,
    20,
  );

  await assert.rejects(
    store.update("counter", (state) =>
      fixedWindow(state, { limit: 1, windowMs: 1000 }, 0),
    ),
    /Counter update timed out/,
  );
});

test("a stalled Redis command respects the update deadline", async (t) => {
  const cleanup = new AbortController();
  t.after(() => cleanup.abort());
  const store = new RedisStore(
    {
      withAbortSignal: (signal) => ({
        get: () =>
          setTimeout(10000, null, {
            signal: AbortSignal.any([signal, cleanup.signal]),
          }),
        eval: async () => 1,
      }),
    },
    undefined,
    20,
  );

  await assert.rejects(
    store.update("counter", (state) =>
      fixedWindow(state, { limit: 1, windowMs: 1000 }, 0),
    ),
    /Counter update timed out/,
  );
});
