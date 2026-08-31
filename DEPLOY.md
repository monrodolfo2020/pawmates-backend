# Deploying

The database is **Turso** (see README's Database section) — it lives in
your own Turso account regardless of where the app itself runs, and the
same Turso database can be shared by a Render deployment and a Vercel
deployment running side by side (useful while switching between the two,
or just keeping one as a fallback).

## One-time: create the Turso database

1. Install the Turso CLI and sign in (see https://docs.turso.tech —
   `turso auth login`), or use the Turso web dashboard if you'd rather not
   install anything.
2. Create the database and grab its connection details:
   ```bash
   turso db create pawmates
   turso db show pawmates --url        # → TURSO_DATABASE_URL, starts with libsql://
   turso db tokens create pawmates     # → TURSO_AUTH_TOKEN
   ```
   Both come from *your* Turso account — this repo/Claude has no access to
   generate them for you.

Push this repo to GitHub before either deploy path below (see the main
README's Setup section for local verification first — build/lint/test
should all be green).

## Deploying to Render

1. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses [`render.yaml`](./render.yaml) and shows you every
   resource it's about to create *before creating anything* — read that
   preview carefully.
2. Apply the Blueprint. Render will prompt you to fill in
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the `sync: false` entries
   in `render.yaml`) — paste in the values from the previous step.
3. `pawmates-api`'s container command runs the migration (against the
   compiled `data-source.js`, no `ts-node` needed) and then starts the
   app, in that order, every time it boots — check its deploy log for the
   migration output if it fails to come up healthy. Safe to repeat:
   TypeORM skips migrations already recorded as applied.

## Deploying to Vercel

1. In the Vercel dashboard: **Add New > Project**, import this repo.
   Vercel reads [`vercel.json`](./vercel.json) — a "Other" framework
   project with no build/output surprises, since the whole app is one
   serverless function (`api/index.js`).
2. **Before the first deploy**, add `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` under **Project Settings > Environment Variables**
   (all environments). Unlike Render's per-service env tab, these need to
   exist *before* you deploy — `vercel.json`'s `buildCommand` runs the
   database migration as part of the build step, so it needs them right
   away, not just at runtime.
3. Also add `JWT_SECRET` (any long random string — Vercel doesn't have
   Render's `generateValue: true` auto-generation, so pick one yourself,
   e.g. `openssl rand -hex 32`).
4. Deploy. Watch the build log for the migration output, same as Render's
   deploy log.
5. Point your frontend's API base URL at the Vercel deployment's URL
   (same `/health`, `/v1/...` paths as Render — nothing else changes).

Cold starts here work a little differently than Render's: the whole Nest
app boots inside the serverless function on its first invocation after
being idle, then stays warm for subsequent requests for a while. In
practice this is comparable to (not worse than) Render's free-plan
spin-down/cold-start behavior — just triggered slightly differently.

## Promote your account to admin

There's no self-service path to the `admin` role (see README's Identity
section for why) — after signing up a normal account through whichever
deployment you're using, promote it directly in the database, using
either the Turso web dashboard's SQL console, or the CLI:
```bash
turso db shell pawmates
```
```sql
UPDATE identity_accounts
SET roles = json_insert(roles, '$[#]', 'admin')
WHERE email = 'you@example.com';
```
(`json_insert(..., '$[#]', 'admin')` appends `"admin"` to whatever roles
the account already has, rather than overwriting them.)

## Migrating from a previous Postgres deployment

This is a **from-scratch database engine swap, not a data migration**: if
this project was previously deployed against Render's managed Postgres,
none of that data (accounts, pets, bookings, storefronts, orders) carries
over automatically. The new Turso database starts empty. If you need the
old data preserved, that's a separate export/import step this repo
doesn't currently automate — ask for it explicitly if you want it built.

Once a new deployment is live and confirmed working, these Render
resources from earlier setups are no longer used by anything and can be
deleted from the Render dashboard whenever you're ready (not done
automatically, in case you want to keep them around a little longer as a
backup): the old `pawmates-db` Postgres resource, and the
`pawmates-redis` resource (the idempotency cache it backed now lives in
Turso instead — see README's Database section).

## Cost and its tradeoffs

- Free Render web services spin down after inactivity and cold-start on
  the next request; Vercel's free-plan serverless functions have a
  comparable cold-start behavior for the same reason (see above) — fine
  for a demo, not for anything latency-sensitive, on either platform.
- Turso's free tier has its own storage/row-read limits — check your
  Turso dashboard if usage grows; this project's data volume (a handful
  of tables, no media beyond base64 photos) is small enough to comfortably
  fit it for a demo.

## What's intentionally out of scope here

- **No API gateway** — `pawmates-api` is a single deployable (a Render
  Web Service, or a single Vercel serverless function). Fine for this
  MVP's single deployable; a real production setup fronting multiple
  services would need a gateway/BFF, which this repo doesn't have (see
  README's "Consolidated MVP" section for why there's only one service to
  begin with).
- **No message broker.** The domain-event-log tables (`*_outbox_events`)
  are written but nothing drains them — see README.
- **Provider verification and pet photos live in the database as base64**,
  not object storage — see README's Identity section for the tradeoff
  that accepts. Anyone with the Turso auth token can read every uploaded
  ID document; fine for a demo with test accounts, not for anything real.
- **JWT_SECRET**: Render generates one for you (`generateValue: true`,
  a real random value, set once at creation and never in the repo or in
  chat). Vercel doesn't have that feature — you pick the value yourself
  when setting the environment variable (step 3 above). Locally,
  `docker-compose.yml` still uses the shared literal
  `dev-secret-change-me` for convenience. Whichever deployment you're
  testing against, copy its actual `JWT_SECRET` value from that
  platform's dashboard to mint a test token — nothing else needs it,
  since no other service verifies these tokens today.
