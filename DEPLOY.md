# Deploying to Render

[`render.yaml`](./render.yaml) is a Blueprint deploying this consolidated
MVP's topology: one web service (`pawmates-api`) plus a managed Redis —
all on Render's **free** plan, so applying it requires no payment info on
file. The database itself is **Turso** (see README's Database section),
which lives in your own Turso account, not as a Render-managed resource.

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

## Steps

1. Push this repo to GitHub (see the main README's Setup section for
   local verification first — build/lint/test should all be green).
2. In the Render dashboard: **New > Blueprint**, point it at this repo.
   Render parses `render.yaml` and shows you every resource it's about to
   create *before creating anything* — read that preview carefully.
3. Apply the Blueprint. Render will prompt you to fill in
   `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the `sync: false` entries
   in `render.yaml`) — paste in the values from the previous step.
4. `pawmates-api`'s container command runs the migration (against the
   compiled `data-source.js`, no `ts-node` needed) and then starts the
   app, in that order, every time it boots — check its deploy log for the
   migration output if it fails to come up healthy. Safe to repeat:
   TypeORM skips migrations already recorded as applied.
5. Sign up a normal account through the app, then promote it to `admin`
   directly in the database (there's no self-service path — see README's
   Identity section for why) using either the Turso web dashboard's SQL
   console, or the CLI:
   ```bash
   turso db shell pawmates
   ```
   ```sql
   UPDATE identity_accounts
   SET roles = json_insert(roles, '$[#]', 'admin')
   WHERE email = 'you@example.com';
   ```
   (`json_insert(..., '$[#]', 'admin')` appends `"admin"` to whatever
   roles the account already has, rather than overwriting them.)

## Migrating from a previous Postgres deployment

This is a **from-scratch database engine swap, not a data migration**: if
this project was previously deployed against Render's managed Postgres,
none of that data (accounts, pets, bookings, storefronts, orders) carries
over automatically. The new Turso database starts empty. If you need the
old data preserved, that's a separate export/import step this repo
doesn't currently automate — ask for it explicitly if you want it built.

Once the new deployment is live, the old `pawmates-db` Postgres resource
in Render is no longer used by anything and can be deleted from the
Render dashboard whenever you're ready (not done automatically, in case
you want to keep it around a little longer as a backup).

## Cost and its tradeoffs

- Free Render web services spin down after inactivity and cold-start on
  the next request — fine for a demo, not for anything latency-sensitive.
- Turso's free tier has its own storage/row-read limits — check your
  Turso dashboard if usage grows; this project's data volume (a handful
  of tables, no media beyond base64 photos) is small enough to comfortably
  fit it for a demo.

## What's intentionally out of scope here

- **No API gateway** — `pawmates-api` is a single public Render Web
  Service. Fine for this MVP's single deployable; a real production setup
  fronting multiple services would need a gateway/BFF, which this repo
  doesn't have (see README's "Consolidated MVP" section for why there's
  only one service to begin with).
- **No message broker.** The domain-event-log tables (`*_outbox_events`)
  are written but nothing drains them — see README.
- **Provider verification and pet photos live in the database as base64**,
  not object storage — see README's Identity section for the tradeoff
  that accepts. Anyone with the Turso auth token can read every uploaded
  ID document; fine for a demo with test accounts, not for anything real.
- **JWT_SECRET** is Render-generated (`generateValue: true`) — a real
  random value, set once at creation and never in the repo or in chat.
  Locally, `docker-compose.yml` still uses the shared literal
  `dev-secret-change-me` for convenience. To mint a test token against the
  deployed instance, copy the actual value from `pawmates-api`'s
  **Environment** tab in the Render dashboard — nothing else needs it,
  since no other service verifies these tokens today.
