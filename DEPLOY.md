# Deploying to Render

This repo includes a [`render.yaml`](./render.yaml) Blueprint that mirrors
`docker-compose.yml`'s topology on Render: all 15 services, a managed
Postgres, a managed Redis, and a self-hosted single-node Redpanda (Render
has no managed Kafka offering).

**This file was originally written without live access to Render's current
docs.** Render's Blueprint preview has since validated it end to end — the
`fromDatabase` properties and `redpanda`'s `runtime: image` block (the two
things flagged as uncertain) both came back clean. Two real issues it did
catch, both about the `free` plan specifically (fixed below): it doesn't
support `preDeployCommand`, and it doesn't support persistent disks.

## Cost

Everything — all 15 web services, Postgres, Redis, and Redpanda — is on
Render's **free** plan, so no payment info is required to apply this
Blueprint. Three real consequences of that:

- Free web services spin down after inactivity and cold-start on the
  next request — fine for a demo, not for anything latency-sensitive.
- **`redpanda` on `free` is the one real risk.** The outbox relay and
  Kafka consumers need a broker that's always reachable; a free *web*
  service wakes on an inbound HTTP request, but a free *private* service
  receiving a raw Kafka TCP connection from another private service may
  not wake the same way. If `booking-svc`/`commerce-svc` fail their Kafka
  connection on boot, that's this tradeoff biting — bump just `redpanda`
  to `plan: starter` (~$7/mo, the only thing here that would ever cost
  anything) to fix it.
- **Render's free Postgres is deleted after a fixed expiration window**
  (historically ~30-90 days) unless upgraded. If this is meant to carry
  real data, upgrade `pawmates-db`'s plan before that happens — don't
  find out by losing the database.
- **Redpanda has no persistent disk** (also unsupported on `free`) — its
  data dir lives on the container's ephemeral filesystem, so any event not
  yet delivered when it restarts/redeploys is lost. Fine for a reference
  deployment; `plan: starter` would also be needed to attach a real disk.

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
- **Secrets**: `JWT_SECRET` is the same `dev-secret-change-me` literal
  `docker-compose.yml` uses locally (not a Render-generated per-service
  secret — every `JwtAuthGuard` needs to verify tokens against the same
  value). Rotate this to a real generated secret, shared the same way,
  before this carries real traffic.
