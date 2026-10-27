import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app";

for (const url of ["/foo", "/bar"]) {
  test(`GET ${url} returns a JSON success response`, async (t) => {
    const app = buildApp();
    t.after(() => app.close());

    const response = await app.inject({
      method: "GET",
      url,
      headers: { authorization: "Bearer client-1" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { success: true });
    assert.match(response.headers["content-type"] ?? "", /application\/json/);
  });
}
