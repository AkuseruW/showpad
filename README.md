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
curl -i http://127.0.0.1:3000/foo
curl -i http://127.0.0.1:3000/bar
```

Accepted requests return `200` with `{"success":true}`.

Settings: `HOST`, `PORT`.

## Tests

```sh
pnpm check
```

`pnpm check`: types, unit tests, formatting, build.
