# pawmates-backend

Backend for **PawMates** (a Rover/Wag-style pet-services marketplace) — a
NestJS monorepo of 14 Bounded-Context services, generated from the
project's own Domain Model, Architecture, Data Model, and API Design docs
(Prompts 1–4 of the project's 10-prompt plan).

**Scope of this prompt (Prompt 5 — Backend):** `booking-svc` is fully
implemented (domain layer, saga orchestration, persistence, gRPC clients,
Kafka outbox/consumer, REST API, tests). The other 13 services are
scaffolded — enough to build, run, and be called, but without their own
domain/persistence layers. `marketplace-svc`, `trust-safety-svc`, and
`payments-svc` implement just enough of their gRPC contract (fixed/mock
responses) for `booking-svc`'s saga to run end to end; `gps-svc` exposes
the two REST endpoints that drive the walk lifecycle
(`POST /v1/trips/:bookingId/start|complete`) and publishes the
corresponding Kafka events. The remaining 9 are health-check-only stubs.

**PawMates Commerce (Prompt 5 follow-up):** `commerce-svc` is a 15th,
fully-implemented service — walkers get their own storefront to sell
products (treats, toys, accessories, service add-ons), delivered on the
owner's next walk rather than shipped. It follows the same discipline as
`booking-svc` (hexagonal ports, its own saga, transactional outbox), and
adds `booking-svc`'s one inbound gRPC method
(`BookingService.GetUpcomingConfirmedBooking`) plus two new
`PaymentsService` stub methods (`ChargeOrder` / `RefundOrder`, pay-in-full
at checkout rather than authorize-then-capture). See
[Architecture (commerce-svc)](#architecture-commerce-svc) below.

## Why booking-svc

Booking sits at the center of every other context (Marketplace,
Trust & Safety, Payments, GPS) and is the one saga complex enough to prove
out this repo's real patterns: hexagonal ports, saga orchestration (not
choreography), the transactional outbox, and idempotent event consumers.
Building it for real — rather than scaffolding all 14 shallowly — is what
actually exercises those patterns.

## Services & ports

| Service | HTTP | gRPC | Status |
|---|---|---|---|
| identity-svc | 3001 | — | skeleton |
| trust-safety-svc | 3002 | 50053 | gRPC stub |
| pets-svc | 3003 | — | skeleton |
| marketplace-svc | 3004 | 50052 | gRPC stub |
| **booking-svc** | **3005** | **50055** | **full implementation** |
| payments-svc | 3006 | 50054 | gRPC stub |
| gps-svc | 3007 | — | REST + Kafka producer stub |
| messaging-svc | 3008 | — | skeleton |
| reviews-svc | 3009 | — | skeleton |
| notifications-svc | 3010 | — | skeleton |
| support-svc | 3011 | — | skeleton |
| marketing-svc | 3012 | — | skeleton |
| analytics-svc | 3013 | — | skeleton |
| admin-svc | 3014 | — | skeleton |
| **commerce-svc** | **3015** | — | **full implementation** |

Every service exposes `GET /health`.

## Architecture (booking-svc)

```
apps/booking-svc/src/
  domain/           # Aggregate root, entities, value objects, policies,
                     # ports (interfaces only — no framework imports),
                     # the saga (BookingProcessManager)
  infra/
    grpc/           # Concrete adapters for the ports, over gRPC
    persistence/    # TypeORM entities' migration, DataSource for the CLI
    messaging/      # Kafka producer (outbox relay) + consumer (gps.events)
    redis.provider.ts
  api/              # Controllers, DTOs
```

- **Saga, not choreography** (Architecture ADR-05): `BookingProcessManager`
  explicitly orchestrates CreateBooking → CheckAvailability →
  CheckVerificationValid → NoDoubleBookingPolicy → persist. Payment is
  authorized at `acceptBooking()` time, not at creation — nobody's card is
  charged before a provider has agreed to do the work.
- **Transactional outbox**: every state-changing saga step writes its
  Kafka event into `booking.outbox_events` in the *same* DB transaction as
  the aggregate write; `OutboxRelayJob` drains it on a 5s cron. At-least-once
  delivery, so `gps-events.consumer.ts` is written to be idempotent.
- **IDs**: aggregate roots use ULIDs (time-ordered, see `ulid` package),
  stored as Postgres `text` columns — not `uuid`, since a ULID's Crockford
  base32 encoding isn't valid RFC-4122 UUID syntax. Everything that
  references another Bounded Context's own ID (`owner_id`, `provider_id`,
  `pet_id`, `address_id`) stays a real `uuid`.
- **Money**: integer minor-currency-unit amounts (`Money` value object) —
  never floats.

## Architecture (commerce-svc)

```
apps/commerce-svc/src/
  domain/           # Storefront, Product, Order + OrderLineItem, OrderStatus,
                     # RequiresUpcomingBookingPolicy, the saga (CommerceProcessManager)
  infra/
    grpc/           # trust-safety / payments / booking gRPC clients
    persistence/    # TypeORM entities' migration, DataSource for the CLI
    messaging/      # Kafka producer (outbox relay) + consumer (booking.events)
    redis.provider.ts
  api/              # Controllers, DTOs
```

Model: **tienda propia por paseador** — each provider gets their own
storefront and sets their own products/prices (not a PawMates-curated
catalog), delivered on the owner's next walk (no shipping/carrier).

- **Pay in full at checkout**, unlike Booking (authorized at accept,
  captured at completion) — `PaymentsService.ChargeOrder` runs inside
  `CommerceProcessManager.placeOrder()`, before the Order is ever
  persisted, same "fail fast, don't touch the database yet" discipline as
  `createBooking`.
- **RequiresUpcomingBookingPolicy**: an Order only reaches
  `awaiting_delivery` once a confirmed, still-future Booking exists
  between that owner and that provider — checked via `booking-svc`'s one
  inbound gRPC method, `BookingService.GetUpcomingConfirmedBooking`. If
  none exists yet, the Order stays `paid` and the owner retries
  `POST /v1/orders/:id/attach-delivery-booking` once they've booked a walk.
- **Delivery is never inferred from GPS.** `commerce-svc` consumes
  `booking.events`/`WalkFinished` (booking-svc's own event, itself
  triggered by `gps.events`/TripCompleted) only to *open a delivery
  window* — actually marking an Order `delivered` always requires the
  walker's explicit `POST /v1/orders/:id/confirm-delivery`.
- **Optimistic stock locking**: `Product.version` (`@VersionColumn`) means
  two concurrent orders can't both win the last unit — the loser's save
  fails and the saga surfaces it as `commerce.insufficient_stock`.

## Prerequisites

- Node.js 20+
- PostgreSQL 16, Redis 7, and a Kafka-API-compatible broker (Redpanda is
  what `docker-compose.yml` uses) — or Docker, to run all three via compose.

## Setup

```bash
npm install

# Start Postgres/Redis/Redpanda only (services run on your host instead):
docker compose up -d postgres redis redpanda

# Run booking-svc's and commerce-svc's migrations once Postgres is up:
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=pawmates \
  npm run migration:run:booking-svc
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=pawmates \
  npm run migration:run:commerce-svc

npm run build           # builds all 15 apps
npm test                # unit + integration tests (booking-svc, commerce-svc)
npm run start:booking-svc:dev
npm run start:commerce-svc:dev
```

The `no-double-booking.policy.integration.spec.ts` suite talks to a real
Postgres (using the same `DB_*` env vars, defaulting to
`127.0.0.1:5432`/`postgres`/`postgres`/`pawmates`) to exercise the raw-SQL
overlap query — it skips itself with a console warning if no database is
reachable, so `npm test` still passes without one.

### Everything via Docker

```bash
docker compose up --build
```

This builds one shared image from the `Dockerfile` (every service selects
its entrypoint at *runtime* via its own `APP_NAME` env var, not a build
arg — see the Dockerfile's top comment), brings up Postgres/Redis/Redpanda
with health checks, runs booking-svc's and commerce-svc's migrations as
one-shot jobs, and starts all 15 services. Requires a Compose version
supporting the `service_completed_successfully` depends_on condition
(Docker Compose v2.20+).

### Deploying to Render

[`render.yaml`](./render.yaml) is a Blueprint that deploys this same
topology to Render. See [DEPLOY.md](./DEPLOY.md) before applying it — it
was written without live access to Render's docs, so it documents exactly
what to double-check in Render's Blueprint preview first.

## Monorepo layout

```
apps/<service>/src/     # one folder per Bounded-Context service
libs/common/src/        # Money, DomainError hierarchy, Kafka topics/envelope,
                         # transactional-outbox base entity, JWT guard,
                         # idempotency interceptor
libs/proto/src/         # .proto files + hand-written TS client interfaces
                         # for the 4 internal gRPC contracts booking-svc/commerce-svc call
scripts/                # scaffold-monorepo.js (one-time), build-all.js
```

Every `apps/*/tsconfig.app.json` pins `rootDir` to the repo root, so every
service's build output lands at the same path shape —
`dist/apps/<name>/apps/<name>/src/main.js` — regardless of whether that
service imports from `libs/*` or not. The Dockerfile relies on this.
