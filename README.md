# Showpad API throttling

## Run

Node.js 24, pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Local URL: `http://127.0.0.1:3000`.

Storage defaults to memory. With Redis:

```sh
docker compose up -d --wait
STORAGE=redis pnpm dev
```

With both services in Docker:

```sh
docker compose --profile app up --build -d --wait
```

## API

```sh
curl -i -H 'Authorization: Bearer client-1' http://127.0.0.1:3000/foo
curl -i -H 'Authorization: Bearer client-2' http://127.0.0.1:3000/bar
```

Client IDs and limits: [config/clients.json](config/clients.json).
Invalid client IDs return `401`.

Accepted requests return `200` with `{"success":true}`.

`/foo`: fixed window. The quota resets at each window boundary.
Exhausted quotas return `429` with `Retry-After` in seconds.
Storage errors return `503`.

`/bar`: token bucket. Tokens refill continuously up to the bucket capacity.

Memory keeps counters in the Node process. Redis persists them and shares quotas
between instances. Updates use Lua compare-and-set.

Conflicting updates retry for up to two seconds.

Redis must be running at startup; the client reconnects after later outages.

Settings: `HOST`, `PORT`, `CLIENTS_FILE`, `STORAGE`, `REDIS_URL`.
`docker compose down -v` deletes the Redis volume.

## Tests

```sh
pnpm check
pnpm test:integration
pnpm demo
```

`pnpm check`: types, unit tests, formatting, build.

Redis must be running for integration tests. They use temporary keys.

`pnpm demo memory` runs without Redis.
