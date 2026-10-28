# Showpad API throttling

[Demo](http://35.181.206.201/)

## Run

Node.js 24, pnpm 11.25.0.
Docker with Compose is needed for Redis and container runs.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Local URL: `http://127.0.0.1:3000`. Storage defaults to memory.

With Redis:

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

Limits are in [config/clients.json](config/clients.json): 3 requests for
`client-1`, 6 for `client-2`, per 10 seconds on each route.

- `/foo`: fixed window. The quota resets at each window boundary.
- `/bar`: token bucket. Tokens refill continuously up to the bucket capacity.

Responses: `200` with `{"success":true}`, `401` for invalid client IDs,
`429` when the quota is exhausted, `503` when storage is unavailable.
`Retry-After` gives the wait in seconds after a `429`.

Memory keeps counters in the Node process. Redis persists them and shares quotas
between instances. Updates use Lua compare-and-set with a two-second timeout.
Redis must be running at startup; the client reconnects after later outages.

Settings: `HOST`, `PORT`, `CLIENTS_FILE`, `STORAGE`, `REDIS_URL`.
`API_PORT` sets the port published by Compose. `docker compose down -v` deletes
the Redis volume.

## Tests

```sh
pnpm check
pnpm test:integration
pnpm demo
```

`pnpm check`: types, unit tests, formatting, build.
Integration tests and the demo need Redis and use temporary keys.
`pnpm demo memory` runs without Redis.

## AWS

`infra/` contains the Terraform configuration for Lightsail in `eu-west-3`.
The API and Redis run on one instance. The `micro_3_0` plan costs USD 7/month
before taxes, excluding transfer overages. Port 80 is public; SSH is restricted
to `admin_cidr`.

Use an authenticated AWS profile, an RSA SSH key at `~/.ssh/showpad-demo`, and
set `admin_cidr` to your public IPv4 with `/32` in `infra/terraform.tfvars`.

```sh
terraform -chdir=infra init
terraform -chdir=infra validate
terraform -chdir=infra plan -out=deployment.tfplan
terraform -chdir=infra apply deployment.tfplan
```

Terraform provisions the server. The demo image was loaded manually.
Image builds and delivery could be handled by CI/CD.

Run `terraform -chdir=infra destroy` after review. A stopped instance is still
billed. Destruction deletes Redis data; keep the local state until teardown.
