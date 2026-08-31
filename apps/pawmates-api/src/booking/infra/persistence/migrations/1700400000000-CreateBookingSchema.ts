import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates every Booking table (Data Model doc §07) — for Turso/libSQL,
 * not Postgres (see README's Database section for why this repo switched
 * engines). Table names are prefixed `booking_*` since SQLite has no
 * schema concept to separate them the way `booking.*` did.
 *
 * The original Postgres migration declared `bookings` as
 * `PARTITION BY RANGE (scheduled_at)` — a single wide-open partition, no
 * real partitioning benefit ever exercised in this reference
 * implementation, and libSQL has no such feature at all — so this is a
 * plain table with a normal `id` primary key instead of partitioning's
 * required `(id, scheduled_at)` composite.
 */
export class CreateBookingSchema1700400000000 implements MigrationInterface {
  name = 'CreateBookingSchema1700400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE booking_bookings (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        provider_id text NOT NULL,
        status text NOT NULL,
        recurrence_series_id text NULL,
        scheduled_at datetime NOT NULL,
        idempotency_key text NOT NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        updated_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_bookings_owner ON booking_bookings (owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_bookings_provider_status ON booking_bookings (provider_id, status)`,
    );
    // Postgres required this to include scheduled_at (partitioning
    // constraint, see class doc) — no longer needed without partitioning.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_bookings_owner_idempotency ON booking_bookings (owner_id, idempotency_key)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_booking_lines (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        pet_id text NOT NULL,
        service_type_code text NOT NULL,
        duration_value int NOT NULL,
        duration_unit text NOT NULL,
        address_id text NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_booking_lines_booking ON booking_booking_lines (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_price_breakdowns (
        booking_id text PRIMARY KEY,
        rate_amount bigint NOT NULL,
        commission_amount bigint NOT NULL,
        tax_amount bigint NOT NULL,
        tip_estimate bigint NOT NULL,
        total_amount bigint NOT NULL,
        currency text NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE booking_cancellation_records (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        cancelled_by text NOT NULL,
        reason text NULL,
        penalty_amount bigint NOT NULL,
        penalty_currency text NOT NULL,
        cancelled_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_cancellation_records_booking ON booking_cancellation_records (booking_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_reschedule_requests (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        proposed_start datetime NOT NULL,
        requested_by text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE booking_recurrence_series (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        provider_id text NOT NULL,
        rule text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_recurrence_series_owner ON booking_recurrence_series (owner_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_outbox_events (
        id text PRIMARY KEY,
        topic text NOT NULL,
        event_type text NOT NULL,
        partition_key text NOT NULL,
        payload text NOT NULL,
        trace_id text NOT NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_outbox_created ON booking_outbox_events (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE booking_outbox_events`);
    await queryRunner.query(`DROP TABLE booking_recurrence_series`);
    await queryRunner.query(`DROP TABLE booking_reschedule_requests`);
    await queryRunner.query(`DROP TABLE booking_cancellation_records`);
    await queryRunner.query(`DROP TABLE booking_price_breakdowns`);
    await queryRunner.query(`DROP TABLE booking_booking_lines`);
    await queryRunner.query(`DROP TABLE booking_bookings`);
  }
}
