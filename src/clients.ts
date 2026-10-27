import { readFileSync } from "node:fs";

export type Route = "foo" | "bar";

export type RateLimitPolicy = Readonly<{
  limit: number;
  windowMs: number;
}>;

export type Clients = Readonly<
  Record<string, Readonly<Record<Route, RateLimitPolicy>>>
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer`);
  }

  return value;
}

function parsePolicy(value: unknown, name: string): RateLimitPolicy {
  if (!isRecord(value)) {
    throw new Error(`Invalid client policy: ${name}`);
  }

  return {
    limit: positiveInteger(value.limit, `${name}.limit`),
    windowMs: positiveInteger(value.windowMs, `${name}.windowMs`),
  };
}

export function parseClients(value: unknown): Clients {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new Error("Configure at least one client");
  }

  return Object.fromEntries(
    Object.entries(value).map(([id, policies]) => {
      if (!/^\S+$/.test(id) || !isRecord(policies)) {
        throw new Error("Invalid client configuration");
      }

      return [
        id,
        {
          foo: parsePolicy(policies.foo, `${id}.foo`),
          bar: parsePolicy(policies.bar, `${id}.bar`),
        },
      ];
    }),
  );
}

export function loadClients(
  path: string | URL = new URL("../config/clients.json", import.meta.url),
): Clients {
  const input: unknown = JSON.parse(readFileSync(path, "utf8"));
  return parseClients(input);
}
