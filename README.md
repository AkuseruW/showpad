# Showpad API throttling

## Run

Node.js 24, pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Local URL: `http://127.0.0.1:3000`.

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

Settings: `HOST`, `PORT`.

## Tests

```sh
pnpm check
```

`pnpm check`: types, unit tests, formatting, build.
