import assert from "node:assert/strict";
import { test } from "node:test";
import { loadClients, parseClients } from "../src/clients";

test("the supplied clients have different limits", () => {
  const clients = loadClients();

  assert.ok(Object.keys(clients).length >= 2);
  assert.notDeepEqual(clients["client-1"], clients["client-2"]);
});

test("clients can configure each route independently", () => {
  const clients = {
    custom: {
      foo: { limit: 3, windowMs: 1000 },
      bar: { limit: 8, windowMs: 2000 },
    },
  };

  assert.deepEqual(parseClients(clients), clients);
});

for (const input of [null, [], {}, { "invalid id": {} }, { client: {} }]) {
  test(`invalid client configuration fails at startup: ${JSON.stringify(input)}`, () => {
    assert.throws(() => parseClients(input), /client/i);
  });
}

for (const field of ["limit", "windowMs"] as const) {
  for (const value of [
    0,
    -1,
    1.5,
    "3",
    null,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    test(`rejects invalid ${field}: ${String(value)}`, () => {
      const policy = { limit: 3, windowMs: 1000, [field]: value };

      assert.throws(
        () => parseClients({ client: { foo: policy, bar: policy } }),
        /limit|windowMs/,
      );
    });
  }
}
