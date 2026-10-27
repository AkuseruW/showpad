import assert from "node:assert/strict";
import { test } from "node:test";
import { readSettings } from "../src/config";

test("defaults start the memory backend on loopback", () => {
  const config = readSettings({});

  assert.equal(config.storage, "memory");
  assert.equal(config.host, "127.0.0.1");
  assert.equal(config.port, 3000);
});

test("environment settings select Redis and a custom clients file", () => {
  const config = readSettings({
    STORAGE: "redis",
    REDIS_URL: "redis://127.0.0.1:16379/1",
    HOST: "0.0.0.0",
    PORT: "8080",
    CLIENTS_FILE: "/tmp/clients.json",
  });

  assert.equal(config.storage, "redis");
  assert.equal(config.redisUrl, "redis://127.0.0.1:16379/1");
  assert.equal(config.port, 8080);
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.clientsFile, "/tmp/clients.json");
});

test("port zero lets the operating system select an available port", () => {
  assert.equal(readSettings({ PORT: "0" }).port, 0);
});

for (const port of ["", "abc", "3.5", "-1", "65536", "3000junk"]) {
  test(`invalid port ${JSON.stringify(port)} fails before listening`, () => {
    assert.throws(() => readSettings({ PORT: port }), /PORT/);
  });
}

test("an unknown backend fails instead of falling back to memory", () => {
  assert.throws(() => readSettings({ STORAGE: "redsi" }), /STORAGE/);
});

for (const redisUrl of ["", "invalid", "http://localhost:6379"]) {
  test(`invalid Redis URL ${JSON.stringify(redisUrl)} fails at startup`, () => {
    assert.throws(
      () => readSettings({ STORAGE: "redis", REDIS_URL: redisUrl }),
      /REDIS_URL/,
    );
  });
}

test("TLS Redis URLs are supported", () => {
  assert.equal(
    readSettings({ STORAGE: "redis", REDIS_URL: "rediss://localhost:6380" })
      .redisUrl,
    "rediss://localhost:6380",
  );
});
