# Deploying to Render

[`render.yaml`](./render.yaml) is a Blueprint deploying this consolidated
MVP's full topology: one web service (`pawmates-api`), a managed Postgres,
and a managed Redis — all on Render's **free** plan, so applying it
requires no payment info on file.

## Steps

1. Push this repo to GitHub (see the main README's Setup section for
   local verification first — build/lint/test should all be green).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses `render.yaml` and shows you every resource it's about to
   create *before creating anything* — read that preview carefully.
3. Apply the Blueprint. `pawmates-api`'s container command runs the
   migration (against the compiled `data-source.js`, no `ts-node` needed)
   and then starts the app, in that order, every time it boots — check its
   deploy log for the migration output if it fails to come up healthy.
   Safe to repeat: TypeORM skips migrations already recorded as applied.

## Cost and its tradeoffs

Everything here is `free`. Two real consequences:

- Free web services spin down after inactivity and cold-start on the next
  request — fine for a demo, not for anything latency-sensitive.
- **Render's free Postgres is deleted after a fixed expiration window**
  (historically ~30-90 days) unless upgraded. If this is meant to carry
  real data, upgrade `pawmates-db`'s plan before that happens — don't
  find out by losing the database.

## What's intentionally out of scope here

- **No API gateway** — `pawmates-api` is a single public Render Web
  Service. Fine for this MVP's single deployable; a real production setup
  fronting multiple services would need a gateway/BFF, which this repo
  doesn't have (see README's "Consolidated MVP" section for why there's
  only one service to begin with).
- **No message broker.** The domain-event-log tables (`outbox_events` in
  both schemas) are written but nothing drains them — see README.
- **Secrets**: `JWT_SECRET` is the literal `dev-secret-change-me`, same as
  `docker-compose.yml` uses locally. Rotate this to a real generated
  secret before this carries real traffic.
