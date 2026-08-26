# Deploying to Render

This repo includes a [`render.yaml`](./render.yaml) Blueprint that mirrors
`docker-compose.yml`'s topology on Render: all 15 services, a managed
Postgres, a managed Redis, and a self-hosted single-node Redpanda (Render
has no managed Kafka offering).

**This file was originally written without live access to Render's current
docs.** Render's Blueprint preview has since validated it end to end — the
`fromDatabase` properties and `redpanda`'s `runtime: image` block (the two
things flagged as uncertain) both came back clean. The one real issue it
caught: `preDeployCommand` isn't available on the `free` plan, fixed below
by folding the migration into each service's own startup command instead.

## Cost

Everything is on Render's **free** plan except one resource:

- **`redpanda` is on `starter`** (~$7/mo) — the outbox relay and Kafka
  consumers need a broker that's always reachable, not one that spins
  down on idle the way free web services do. This is the one real
  recurring cost in this Blueprint.
- The 15 web services, Postgres, and Redis are all `free`. Two real
  consequences of that:
  - Free web services spin down after inactivity and cold-start on the
    next request — fine for a demo, not for anything latency-sensitive.
  - **Render's free Postgres is deleted after a fixed expiration window**
    (historically ~30-90 days) unless upgraded. If this is meant to carry
    real data, upgrade `pawmates-db`'s plan before that happens — don't
    find out by losing the database.

## Steps

1. Push this repo to GitHub (see the main README's Setup section for local
   verification first — build/lint/test should all be green before you
   deploy).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses `render.yaml` and shows you every resource it's about to
   create *before creating anything* — read that preview carefully. If it
   flags something new, that's this file needing an update to match
   Render's current schema, not a mistake to route around.
3. Apply the Blueprint. Render builds the shared image once (all 15 apps
   compile in one `npm run build` — see the Dockerfile's top comment) and
   reuses it per service, selecting the entrypoint via each service's
   `APP_NAME` env var.
4. `booking-svc` and `commerce-svc` each run their own migration as the
   first step of their container's own start command (not Render's
   Pre-Deploy Command, which the `free` plan doesn't support) — check each
   service's deploy log for the migration output if either fails to come
   up healthy. Safe to repeat on every boot: TypeORM skips migrations
   already recorded as applied.

## What's intentionally out of scope here

- **No API gateway** — every service is deployed as a public Render Web
  Service (matching `docker-compose.yml`'s "everything reachable for
  testing" posture), not gated behind a single entry point. A real
  production deployment would put most of these behind a gateway/BFF and
  make the rest private (Render's `pserv` type) — that's Architecture-doc
  territory this repo hasn't built yet.
- **Redpanda's persistence** uses a single Render disk with no replication
  — fine for a reference deployment, not for anything carrying real data.
- **Secrets**: `JWT_SECRET` is the same `dev-secret-change-me` literal
  `docker-compose.yml` uses locally (not a Render-generated per-service
  secret — every `JwtAuthGuard` needs to verify tokens against the same
  value). Rotate this to a real generated secret, shared the same way,
  before this carries real traffic.
