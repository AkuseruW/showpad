import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app";
import { request } from "./helpers/fixed-window-contract";

test("unavailable counter storage returns 503 rather than admitting a request", async (t) => {
  const app = buildApp({
    store: {
      async update() {
        throw new Error("Storage is unavailable");
      },
    },
  });
  t.after(() => app.close());

  const response = await request(app);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), { error: "rate limiter unavailable" });
  assert.equal(response.headers["retry-after"], undefined);
});

test("authentication is checked before accessing unavailable storage", async (t) => {
  const app = buildApp({
    store: {
      async update() {
        throw new Error("Storage is unavailable");
      },
    },
  });
  t.after(() => app.close());

  assert.equal((await request(app, "/foo", "unknown")).statusCode, 401);
});
