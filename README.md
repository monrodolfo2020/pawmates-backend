# pawmates-backend

Backend for **PawMates** (a Rover/Wag-style pet-services marketplace) — a
consolidated NestJS MVP covering three Bounded Contexts: **Identity**
(accounts, roles, pets, provider verification), **Booking** (a dog walker
or sitter's reservation lifecycle), and **Commerce** (walkers selling
their own products, delivered on the owner's next walk).

## Consolidated MVP

This started as a 15-service, gRPC-and-Kafka microservices design (one
service per Bounded Context, saga orchestration, a transactional outbox
drained to a message broker). That version is still visible in this
repo's git history — it was scoped back to a single deployable for one
concrete reason: running 15 services plus Postgres, Redis, and a Kafka
broker is real infrastructure to operate, and this project needed
something that deploys on a single free-tier host without any of that.

What changed, concretely:

- **Booking and Commerce live in one NestJS app** (`apps/pawmates-api`),
  not two. Each keeps its own `domain/`, `infra/`, `api/` folders and its
  own table-name prefix (`booking_*` / `commerce_*` — see Database
  section) — the *domain and saga code is untouched* from the
  multi-service version, since it only ever depended on port interfaces,
  never on gRPC or Kafka directly.
- **No message broker.** The two places that used to talk over Kafka —
  `gps-svc` publishing trip events for `booking-svc` to consume, and
  `booking-svc` publishing `WalkFinished` for `commerce-svc` to consume —
  are now direct in-process method calls from one small `TripsController`
  (see `apps/pawmates-api/src/trips/trips.controller.ts`). The
  `outbox_events` tables are kept as a plain domain-event audit log
  (still written in the same DB transaction as every aggregate change),
  just with nothing draining them to a broker.
- **No gRPC.** The three external Bounded Contexts Booking depended on
  (Marketplace, Trust & Safety, Payments) and the two Commerce depended on
  (Trust & Safety, Payments) are now in-process **Fake adapters**
  (`infra/adapters/fake-*.adapter.ts`) — same canned responses the old
  gRPC stub *services* returned, just called directly. Commerce's one
  *real* dependency, "does this owner have a confirmed upcoming booking
  with this provider" (`RequiresUpcomingBookingPolicy`), is now a genuine
  in-process query against Booking's own repository
  (`InProcessBookingAdapter`) instead of a network hop — a real
  improvement consolidation enables, not just a simplification.
- **11 other Bounded Contexts** (GPS beyond `TripsController`, Messaging,
  Reviews, Notifications, Support, Marketing, Analytics, and the parts of
  Identity/Pets/Admin not described below) that were health-check-only
  skeletons before are dropped entirely for now — they added no real
  behavior, only more services to deploy.

## What's implemented

**Identity**: real email+password accounts (bcrypt-hashed), issuing the
same JWTs `JwtAuthGuard` already verified everywhere else — this replaced
the MVP's original no-password `dev-login` shortcut. **One account can
hold several roles** (`owner`, `provider`, `admin`) at once —
`POST /v1/auth/roles` adds one to an existing account, matching the
frontend's owner/provider mode toggle rather than forcing a second
signup. Signing up (or adding) the `provider` role requires a face photo
and an ID document photo — captured into `ProviderVerification` with
`status: 'pending'` and nothing checking them yet; that's the AI
identity-verification step this is laying groundwork for, not building.
Owners manage any number of `Pet` records (name, breed, size,
temperament, vaccines, an optional photo). No self-service path grants
the `admin` role — promote the first one by hand (see DEPLOY.md).

**Booking**: request → provider accepts (payment authorized) → confirmed
→ in-progress → completed, plus cancel/reject/reschedule and recurring
bookings. Saga orchestration (`BookingProcessManager`), a
`NoDoubleBookingPolicy` backed by a raw-SQL overlap query, ULID aggregate
IDs, integer minor-currency-unit `Money`.

**Commerce** ("tienda propia por paseador" — each walker gets their own
storefront and prices, not a PawMates-curated catalog): place an order
(charged in full at checkout), link it to a confirmed upcoming Booking
for delivery, and have the walker explicitly confirm hand-off — never
inferred from the trip alone. Optimistic stock locking via
`Product.version` so two orders can't both win the last unit.
`GET /v1/storefronts` lists every open storefront — this MVP has no real
Marketplace/discovery Bounded Context, so it's how an owner finds a
walker's shop rather than through curated search. Admin gets read-only
platform-wide oversight of both storefronts and orders
(`GET /v1/admin/storefronts`, `GET /v1/admin/orders`), same pattern as
its existing accounts/verifications endpoints.

Two things are locked down for now, both easy to loosen later: **opening
a storefront is admin-only** (`POST /v1/storefronts` takes a
`providerId` and requires the caller's `admin` role — a provider can no
longer self-serve one; the platform wants to control who's allowed to
sell before opening that up), and **a provider can't list an arbitrary
product** — `POST /v1/storefronts/me/products` takes a `catalogItemId`,
not free-text name/description/category, and copies those fields from
`CatalogItem` onto the `Product` at creation time (so a later catalog
edit never silently changes something already for sale — same
snapshot rationale `OrderLineItem` already uses). The catalog seeds with
100 generic pet-store items (`AddProductCatalog` migration) across every
`ProductCategory`, no photos (`photo_base64` starts `NULL`) — the admin
adds those through `PATCH /v1/admin/catalog/:id`
(`GET /v1/admin/catalog` lists all of them; `GET /v1/storefronts/catalog`
is the provider-facing subset, active only).

Full request→response flow, end to end: `POST /v1/bookings` → accept →
`POST /v1/trips/:id/start|complete` → `POST /v1/orders` → confirm
delivery. Exercised live (see git history / this MVP's development) with
a real Turso/libSQL database and Redis, not just unit-tested.

## Architecture

```
apps/pawmates-api/src/
  app.module.ts       # one TypeOrmModule.forRoot covering every context's entities
  identity/
    domain/entities/  # Account, Pet, ProviderVerification — no saga here,
                       # this context is plain CRUD plus password hashing
    api/               # auth.controller.ts (signup/login/roles),
                        # me.controller.ts, pets.controller.ts,
                        # admin.controller.ts
    identity.module.ts
  booking/
    domain/           # Aggregate root, entities, value objects, policies,
                       # ports (interfaces only — no framework imports),
                       # the saga (BookingProcessManager) — unchanged from
                       # the multi-service version
    infra/
      adapters/        # Fake Marketplace/TrustSafety/Payments adapters
      persistence/     # TypeORM entities' migration
    api/               # Controllers, DTOs
    booking.module.ts
  commerce/            # same shape as booking/, plus infra/adapters/
                        # in-process-booking.adapter.ts (the one *real*,
                        # not faked, adapter)
    ...
    commerce.module.ts
  trips/
    trips.controller.ts   # POST /v1/trips/:id/start|complete — replaces
                            # gps-svc + the Kafka events it used to publish
  infra/
    redis.provider.ts
    persistence/data-source.ts  # combined DataSource for the migration CLI
```

- **Saga, not choreography**: `BookingProcessManager` explicitly
  orchestrates CreateBooking → CheckAvailability → CheckVerificationValid
  → NoDoubleBookingPolicy → persist. Payment is authorized at
  `acceptBooking()` time, not at creation — nobody's card is charged
  before a provider has agreed to do the work. `CommerceProcessManager`
  charges in full at `placeOrder()` time instead (a normal checkout, not a
  future service), same "fail fast, don't touch the database until every
  synchronous check has passed" discipline.
- **Domain event log**: every state-changing saga step still writes a row
  to its own `outbox_events` table in the *same* DB transaction as the
  aggregate write — an audit trail, not wired to anything today. Reusing
  it as a real outbox (draining to a broker) would need zero changes to
  the process managers, only a relay job back.
- **Delivery is never inferred from the trip alone.** `TripsController`'s
  `complete` handler calls `commerceProcessManager.openDeliveryWindowForBooking()`
  right after finishing the booking — that only *opens the window*;
  marking an Order `delivered` always requires the walker's own explicit
  `POST /v1/orders/:id/confirm-delivery`.
- **IDs**: aggregate roots use ULIDs (time-ordered, see `ulid` package),
  stored as `text` columns — not `uuid`, since a ULID's Crockford
  base32 encoding isn't valid RFC-4122 UUID syntax (and, separately,
  SQLite/libSQL has no native `uuid` column type at all). Everything that
  references another Bounded Context's own ID (`owner_id`, `provider_id`,
  `pet_id`, `address_id`, and `Order.deliveryBookingId` — a `Booking.id`)
  needs to match that convention too.
- **Money**: integer minor-currency-unit amounts (`Money` value object) —
  never floats.
- **Provider verification photos are base64 text columns**
  (`ProviderVerification.facePhotoBase64` / `idDocumentPhotoBase64`, same
  for `Pet.photoBase64`), not object storage — a deliberate MVP tradeoff
  (see DEPLOY.md's Cost section) to avoid a second paid service. Sensitive
  data sitting in the same database as everything else; treat this as a
  demo posture, not a template for handling real ID documents.

## Database

The database is **Turso** — a hosted platform built on **libSQL** (an
open-source SQLite fork with remote-access/replica support), not
PostgreSQL. TypeORM has no dedicated Turso/libSQL dialect, so this project
reuses TypeORM's built-in `better-sqlite3` driver, aliased at the package
level to actually load `libsql` instead
(`package.json`: `"better-sqlite3": "npm:libsql@^0.5"` — `libsql`'s client
implements a near-drop-in `better-sqlite3`-compatible API). The connection
itself, including injecting Turso's `authToken` — which TypeORM's own
`BetterSqlite3Driver` doesn't know how to forward — is centralized in
[`apps/pawmates-api/src/infra/persistence/libsql-connection.ts`](./apps/pawmates-api/src/infra/persistence/libsql-connection.ts).

No `TURSO_DATABASE_URL` set → falls back to a local libSQL file
(`SQLITE_LOCAL_PATH`, default `./pawmates-local.db`) — the same engine,
just not synced to Turso, so local dev and `npm test` need no Turso
account at all.

SQLite/libSQL has no schema concept, so the old `identity.*` /
`booking.*` / `commerce.*` Postgres schema-per-Bounded-Context split is
now a table-name prefix instead (`identity_accounts`, `booking_bookings`,
`commerce_products`, ...).

**Note**: this is a from-scratch database engine, not an in-place upgrade
— any existing data in a previous Postgres deployment does not carry over
automatically. See DEPLOY.md.

## Prerequisites

- Node.js 20+
- Redis 7 — or Docker, to run it via compose. (No separate database
  server to install — see Database section above.)

## Setup

```bash
npm install

# Start Redis only (the app runs on your host instead):
docker compose up -d redis

# Run the migration — writes to ./pawmates-local.db by default, no
# Turso account needed for local dev:
npm run migration:run:pawmates-api

npm run build
npm test
npm run start:pawmates-api:dev
```

The `no-double-booking.policy.integration.spec.ts` suite talks to a real
local libSQL file (a throwaway one, separate from your dev database) to
exercise the raw-SQL overlap query — it skips itself with a console
warning if that file can't be opened, so `npm test` still passes even in
a restricted sandbox.

### Everything via Docker

```bash
docker compose up --build
```

Brings up Redis with a health check, then `pawmates-api` — whose
container command runs the migration (against the *compiled*
`data-source.js`, no `ts-node` needed at runtime, writing to a file on
the `sqlite-data` volume) and then starts the app, in that order, on
every boot. Safe to repeat: TypeORM skips migrations already recorded as
applied.

### Deploying to Render

[`render.yaml`](./render.yaml) deploys the app plus a managed Redis to
Render, entirely on the free plan — the database itself is your own
Turso account, not a Render-managed resource. See
[DEPLOY.md](./DEPLOY.md) for the one-time setup steps.

## Monorepo layout

```
apps/pawmates-api/src/  # the one deployable — see Architecture above
libs/common/src/        # Money, DomainError hierarchy, event-topics,
                         # domain-event-log base entity, JWT guard,
                         # idempotency interceptor
scripts/build-all.js    # builds every app in nest-cli.json's `projects`
```

`apps/pawmates-api/tsconfig.app.json` pins `rootDir` to the repo root, so
the build output lands at `dist/apps/pawmates-api/apps/pawmates-api/src/`.
The Dockerfile and `infra/persistence/data-source.ts` both rely on this
exact path shape.
