import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app";

for (const url of ["/foo", "/bar"]) {
  for (const authorization of [
    undefined,
    "",
    "Basic client-1",
    "Bearer",
    "Bearer ",
    "Bearer unknown",
    "Bearer CLIENT-1",
    "Bearer client-1 extra",
    "Bearer toString",
    "Bearer __proto__",
  ]) {
    test(`${url} rejects authorization ${JSON.stringify(authorization)}`, async (t) => {
      const app = buildApp();
      t.after(() => app.close());

      const response = await app.inject({
        method: "GET",
        url,
        headers: authorization === undefined ? {} : { authorization },
      });

      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: "unauthorized" });
      assert.equal(response.headers["www-authenticate"], "Bearer");
    });
  }

  for (const authorization of ["Bearer client-2", "bEaReR   client-1"]) {
    test(`${url} accepts authorization ${JSON.stringify(authorization)}`, async (t) => {
      const app = buildApp();
      t.after(() => app.close());

      const response = await app.inject({
        method: "GET",
        url,
        headers: { authorization },
      });

      assert.equal(response.statusCode, 200);
    });
  }
}

test("the configured client list replaces the default clients", async (t) => {
  const policy = { limit: 2, windowMs: 1000 };
  const app = buildApp({ clients: { custom: { foo: policy, bar: policy } } });
  t.after(() => app.close());

  for (const url of ["/foo", "/bar"]) {
    const accepted = await app.inject({
      method: "GET",
      url,
      headers: { authorization: "Bearer custom" },
    });
    const rejected = await app.inject({
      method: "GET",
      url,
      headers: { authorization: "Bearer client-1" },
    });

    assert.equal(accepted.statusCode, 200);
    assert.equal(rejected.statusCode, 401);
  }
});
