import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owner/paseador chat thread per booking — see booking-message.entity.ts. */
export class AddBookingMessages1701000000000 implements MigrationInterface {
  name = 'AddBookingMessages1701000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE booking_messages (
        id text PRIMARY KEY,
        booking_id text NOT NULL,
        sender_id text NOT NULL,
        sender_role text NOT NULL,
        text text NOT NULL,
        sent_at datetime NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_booking_messages_booking ON booking_messages (booking_id, sent_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE booking_messages`);
  }
}
