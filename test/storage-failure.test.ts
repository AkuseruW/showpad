import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app";
import { request } from "./helpers/fixed-window-contract";

for (const url of ["/foo", "/bar"]) {
  test(`${url} returns 503 when counter storage is unavailable`, async (t) => {
    const app = buildApp({
      store: {
        async update() {
          throw new Error("Storage is unavailable");
        },
      },
    });
    t.after(() => app.close());

    const response = await request(app, url);

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { error: "rate limiter unavailable" });
    assert.equal(response.headers["retry-after"], undefined);
  });

  test(`${url} checks authentication before accessing storage`, async (t) => {
    const app = buildApp({
      store: {
        async update() {
          throw new Error("Storage is unavailable");
        },
      },
    });
    t.after(() => app.close());

    assert.equal((await request(app, url, "unknown")).statusCode, 401);
  });
}
