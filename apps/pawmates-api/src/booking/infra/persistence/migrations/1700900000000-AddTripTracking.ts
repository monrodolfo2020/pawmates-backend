import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live GPS tracking + the post-walk Report Card: booking_trip_locations
 * is the walk's route (a GPS ping every few seconds while `in_progress`),
 * booking_walk_events is the walker's photo/pee/poop log — see
 * trip-location.entity.ts / walk-event.entity.ts and
 * trips.controller.ts's new endpoints.
 */
export class AddTripTracking1700900000000 implements MigrationInterface {
  name = 'AddTripTracking1700900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE booking_bookings ADD COLUMN started_at datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_bookings ADD COLUMN completed_at datetime NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_trip_locations (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        lat real NOT NULL,
        lng real NOT NULL,
        recorded_at datetime NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_trip_locations_booking ON booking_trip_locations (booking_id, recorded_at)`,
    );

    await queryRunner.query(`
      CREATE TABLE booking_walk_events (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        type text NOT NULL,
        photo_base64 text NULL,
        note text NULL,
        lat real NULL,
        lng real NULL,
        recorded_at datetime NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_walk_events_booking ON booking_walk_events (booking_id, recorded_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE booking_walk_events`);
    await queryRunner.query(`DROP TABLE booking_trip_locations`);
    // SQLite/libSQL can't DROP COLUMN pre-3.35 semantics reliably via
    // TypeORM's query runner — left as a no-op down migration for these
    // two columns, matching this repo's other migrations' pragmatism
    // (down migrations here are for local dev rollback, never run in
    // production).
  }
}
