# Deploying to Render

This repo includes a [`render.yaml`](./render.yaml) Blueprint that mirrors
`docker-compose.yml`'s topology on Render: all 15 services, a managed
Postgres, a managed Redis, and a self-hosted single-node Redpanda (Render
has no managed Kafka offering).

**This file was written without live access to Render's current docs** —
verify it against Render's own validation before trusting it blindly.

## Steps

1. Push this repo to GitHub (see the main README's Setup section for local
   verification first — build/lint/test should all be green before you
   deploy).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses `render.yaml` and shows you every resource it's about to
   create *before creating anything* — read that preview carefully. If it
   flags a syntax error or unknown field, that's this file needing an
   update to match Render's current schema, not a mistake to route around.
3. Two properties are the most likely to have drifted from what's in this
   file:
   - **`fromDatabase` properties** on `booking-svc`/`commerce-svc`
     (`host`, `port`, `user`, `password`, `database`). If Render's
     Blueprint spec only exposes a single `connectionString` today, those
     two services need a small code change — parse `DATABASE_URL` in
     `commerce.module.ts`/`booking.module.ts`'s `TypeOrmModule.forRoot`
     instead of the discrete `DB_*` vars — rather than a YAML tweak alone.
   - **`redpanda`'s `runtime: image` block** (deploying
     `docker.redpanda.com/redpandadata/redpanda:v24.2.7` directly, with no
     Dockerfile of our own). Render has changed how it names "deploy an
     existing image" support before.
4. Apply the Blueprint. Render builds the shared image once (all 15 apps
   compile in one `npm run build` — see the Dockerfile's top comment) and
   reuses it per service, selecting the entrypoint via each service's
   `APP_NAME` env var.
5. `booking-svc` and `commerce-svc` each run their own migration as a
   **Pre-Deploy Command** before every deploy — check each service's
   deploy log for the migration output if either fails to come up healthy.

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
