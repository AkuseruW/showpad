import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app";
import { request, testClients } from "./helpers/fixed-window-contract";
import { tokenBucketContract } from "./helpers/token-bucket-contract";

tokenBucketContract("memory", (t, clock) => {
  const app = buildApp({ clients: testClients, clock });
  t.after(() => app.close());
  return app;
});

test("each route uses its own configured limit and retry duration", async (t) => {
  const app = buildApp({
    clock: () => 0,
    clients: {
      custom: {
        foo: { limit: 1, windowMs: 2500 },
        bar: { limit: 2, windowMs: 5000 },
      },
    },
  });
  t.after(() => app.close());

  assert.equal((await request(app, "/foo", "custom")).statusCode, 200);
  const foo = await request(app, "/foo", "custom");
  assert.equal(foo.statusCode, 429);
  assert.equal(foo.headers["retry-after"], "3");

  assert.equal((await request(app, "/bar", "custom")).statusCode, 200);
  assert.equal((await request(app, "/bar", "custom")).statusCode, 200);
  const bar = await request(app, "/bar", "custom");
  assert.equal(bar.statusCode, 429);
  assert.equal(bar.headers["retry-after"], "3");
});
