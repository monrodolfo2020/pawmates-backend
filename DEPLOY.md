# Deploying

The app runs on **Vercel** (`pawmates-backend-black.vercel.app` —
the frontend's default `API_URL` points here). Render was the original
deployment target and is kept as a documented fallback below, but it's
retired: nothing points at it today, and its `TURSO_AUTH_TOKEN` stopped
working after the token rotation noted further down.

The database is **Turso** (see README's Database section) regardless of
which deployment is running — it's in your own Turso account, not tied
to either platform.

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

## Deploying to Vercel

1. In the Vercel dashboard: **Add New > Project**, import this repo.
   Vercel reads [`vercel.json`](./vercel.json) — a "Other" framework
   project with no build/output surprises, since the whole app is one
   serverless function (`api/index.js`).
2. **Before the first deploy**, add `TURSO_DATABASE_URL` and
   `TURSO_AUTH_TOKEN` under **Project Settings > Environment Variables**
   (all environments). These need to exist *before* you deploy —
   `vercel.json`'s `buildCommand` runs the database migration as part of
   the build step, so it needs them right away, not just at runtime.
3. Also add `JWT_SECRET` (any long random string, e.g.
   `openssl rand -hex 32` — Vercel has no Render-style auto-generation for
   this).
4. Deploy. Watch the build log for the migration output.
5. Point your frontend's API base URL at the Vercel deployment's URL
   (`/health`, `/v1/...` — same paths regardless of platform).

Cold starts here work a little differently than a traditional server's:
the whole Nest app boots inside the serverless function on its first
invocation after being idle, then stays warm for subsequent requests for
a while.

If this is your first time setting this up (rather than working from an
already-working deployment), two Vercel-specific issues already got hit
and fixed in this repo's history — you shouldn't need to rediscover them,
but if a fresh deploy ever crashes on every request again, check
`vercel.json`'s `includeFiles` (libsql's native binary needs to be
force-included, since Vercel's file tracer doesn't reliably follow how it
loads it) and `libsql-connection.ts`'s `libsql://` → `https://` URL
rewrite (Turso's default transport keeps a persistent connection that
goes stale between serverless invocations).

## Deploying to Render (retired, kept as a reference)

This project *was* deployed here first. [`render.yaml`](./render.yaml)
still deploys a working copy, on the same Turso database, if this ever
needs reviving:

1. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses `render.yaml` and shows you every resource it's about to
   create *before creating anything* — read that preview carefully.
2. Apply the Blueprint. Render will prompt you to fill in
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the `sync: false` entries
   in `render.yaml`) — its own token stopped working after the rotation
   below, so this needs a fresh one from Turso either way.
3. `pawmates-api`'s container command runs the migration (against the
   compiled `data-source.js`, no `ts-node` needed) and then starts the
   app, in that order, every time it boots — check its deploy log for the
   migration output if it fails to come up healthy. Safe to repeat:
   TypeORM skips migrations already recorded as applied.

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

## Rotating the Turso auth token

Do this any time a token has been exposed somewhere it shouldn't (chat,
a screenshot, a public commit — whatever). Order matters: invalidating
comes first, so create the replacement right after, before anything
tries to reconnect with the old one:

1. In the Turso dashboard: your database → **Invalidate All Tokens**. This
   immediately breaks *every* existing token for this database, including
   the one every currently-deployed instance is using — expect a brief
   outage on all of them until step 3.
2. Create a new token (dashboard, or `turso db tokens create pawmates`).
3. Update `TURSO_AUTH_TOKEN` with the new value on every deployment you
   actually want working — each platform needs its own redeploy for the
   change to take effect (Render redeploys automatically on an env var
   save; Vercel needs a manual **Redeploy** after saving).

If a deployment isn't worth keeping alive (e.g. Render once Vercel is the
one actually serving traffic), it's fine to just skip updating that one —
it stays broken, which is expected, not a bug to chase.

## Migrating from a previous Postgres deployment

This is a **from-scratch database engine swap, not a data migration**: if
this project was previously deployed against Render's managed Postgres,
none of that data (accounts, pets, bookings, storefronts, orders) carries
over automatically. The new Turso database starts empty. If you need the
old data preserved, that's a separate export/import step this repo
doesn't currently automate — ask for it explicitly if you want it built.

These Render resources from earlier setups are no longer used by
anything and can be deleted from the Render dashboard whenever you're
ready (not done automatically, in case you want to keep them around a
little longer): the old `pawmates-db` Postgres resource, the
`pawmates-redis` resource (the idempotency cache it backed now lives in
Turso instead — see README's Database section), and — now that Vercel is
the live deployment — the `pawmates-api` Render web service itself.

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
