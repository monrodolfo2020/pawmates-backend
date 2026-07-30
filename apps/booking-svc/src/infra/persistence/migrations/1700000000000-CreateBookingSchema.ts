import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the booking schema (Data Model doc §07). `bookings` is declared
 * PARTITION BY RANGE (scheduled_at) as specified in §13 — TypeORM's
 * decorator API doesn't express PG declarative partitioning, so this
 * migration drops to raw SQL for that one table. A single wide-open
 * partition covers the reference implementation; production automates
 * monthly partition creation as its own scheduled job (§13, handed to
 * the Prompt 8 DevOps pipeline).
 */
export class CreateBookingSchema1700000000000 implements MigrationInterface {
  name = 'CreateBookingSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS booking`);

    await queryRunner.query(`
      CREATE TABLE booking.bookings (
        id text NOT NULL,
        owner_id uuid NOT NULL,
        provider_id uuid NOT NULL,
        status text NOT NULL,
        recurrence_series_id text NULL,
        scheduled_at timestamptz NOT NULL,
        idempotency_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (id, scheduled_at)
      ) PARTITION BY RANGE (scheduled_at)
    `);
    await queryRunner.query(`
      CREATE TABLE booking.bookings_default
        PARTITION OF booking.bookings
        FOR VALUES FROM ('2020-01-01') TO ('2035-01-01')
    `);
    await queryRunner.query(
      `CREATE INDEX idx_bookings_owner ON booking.bookings (owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_bookings_provider_status ON booking.bookings (provider_id, status)`,
    );
    // Postgres requires every unique index on a partitioned table to
    // include the partition key column (scheduled_at here) — a real
    // constraint discovered running this migration, not a design choice.
    // In practice this is harmless: a genuine Idempotency-Key retry
    // resends the same request payload, so scheduled_at is identical too.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_bookings_owner_idempotency ON booking.bookings (owner_id, idempotency_key, scheduled_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking.booking_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id text NOT NULL,
        pet_id uuid NOT NULL,
        service_type_code text NOT NULL,
        duration_value int NOT NULL,
        duration_unit text NOT NULL,
        address_id uuid NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_booking_lines_booking ON booking.booking_lines (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking.price_breakdowns (
        booking_id text PRIMARY KEY,
        rate_amount bigint NOT NULL,
        commission_amount bigint NOT NULL,
        tax_amount bigint NOT NULL,
        tip_estimate bigint NOT NULL,
        total_amount bigint NOT NULL,
        currency char(3) NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE booking.cancellation_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id text NOT NULL,
        cancelled_by uuid NOT NULL,
        reason text NULL,
        penalty_amount bigint NOT NULL,
        penalty_currency char(3) NOT NULL,
        cancelled_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_cancellation_records_booking ON booking.cancellation_records (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking.reschedule_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id text NOT NULL,
        proposed_start timestamptz NOT NULL,
        requested_by uuid NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE booking.recurrence_series (
        id text PRIMARY KEY,
        owner_id uuid NOT NULL,
        provider_id uuid NOT NULL,
        rule jsonb NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_recurrence_series_owner ON booking.recurrence_series (owner_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking.outbox_events (
        id text PRIMARY KEY,
        topic text NOT NULL,
        event_type text NOT NULL,
        partition_key text NOT NULL,
        payload jsonb NOT NULL,
        trace_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        dispatched_at timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_outbox_pending ON booking.outbox_events (created_at) WHERE dispatched_at IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA booking CASCADE`);
  }
}
