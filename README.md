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
| **booking-svc** | **3005** | — | **full implementation** |
| payments-svc | 3006 | 50054 | gRPC stub |
| gps-svc | 3007 | — | REST + Kafka producer stub |
| messaging-svc | 3008 | — | skeleton |
| reviews-svc | 3009 | — | skeleton |
| notifications-svc | 3010 | — | skeleton |
| support-svc | 3011 | — | skeleton |
| marketing-svc | 3012 | — | skeleton |
| analytics-svc | 3013 | — | skeleton |
| admin-svc | 3014 | — | skeleton |

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

## Prerequisites

- Node.js 20+
- PostgreSQL 16, Redis 7, and a Kafka-API-compatible broker (Redpanda is
  what `docker-compose.yml` uses) — or Docker, to run all three via compose.

## Setup

```bash
npm install

# Start Postgres/Redis/Redpanda only (services run on your host instead):
docker compose up -d postgres redis redpanda

# Run booking-svc's migration once Postgres is up:
DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_PASSWORD=postgres DB_NAME=pawmates \
  npm run migration:run:booking-svc

npm run build           # builds all 14 apps
npm test                # unit + integration tests (booking-svc)
npm run start:booking-svc:dev
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

This builds all 14 images from the single parameterized `Dockerfile`
(selected per-service via the `APP_NAME` build arg), brings up
Postgres/Redis/Redpanda with health checks, runs booking-svc's migration
as a one-shot job, and starts all 14 services. Requires a Compose version
supporting the `service_completed_successfully` depends_on condition
(Docker Compose v2.20+).

## Monorepo layout

```
apps/<service>/src/     # one folder per Bounded-Context service
libs/common/src/        # Money, DomainError hierarchy, Kafka topics/envelope,
                         # transactional-outbox base entity, JWT guard,
                         # idempotency interceptor
libs/proto/src/         # .proto files + hand-written TS client interfaces
                         # for the 3 internal gRPC contracts booking-svc calls
scripts/                # scaffold-monorepo.js (one-time), build-all.js
```

Every `apps/*/tsconfig.app.json` pins `rootDir` to the repo root, so every
service's build output lands at the same path shape —
`dist/apps/<name>/apps/<name>/src/main.js` — regardless of whether that
service imports from `libs/*` or not. The Dockerfile relies on this.
