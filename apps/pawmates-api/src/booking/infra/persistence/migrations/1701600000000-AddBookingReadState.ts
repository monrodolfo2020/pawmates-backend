import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-account (not per-device) chat read state for a booking — replaces
 * the frontend's earlier AsyncStorage-only tracking. `last_message_at` is
 * bumped whenever either side sends a message (including by the sender,
 * so sending counts as reading your own message); `owner_last_read_at` /
 * `provider_last_read_at` are bumped when that side actually fetches the
 * thread (see BookingController.listMessages/sendMessage).
 */
export class AddBookingReadState1701600000000 implements MigrationInterface {
  name = 'AddBookingReadState1701600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE booking_bookings ADD COLUMN last_message_at datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_bookings ADD COLUMN owner_last_read_at datetime NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_bookings ADD COLUMN provider_last_read_at datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE booking_bookings DROP COLUMN provider_last_read_at`);
    await queryRunner.query(`ALTER TABLE booking_bookings DROP COLUMN owner_last_read_at`);
    await queryRunner.query(`ALTER TABLE booking_bookings DROP COLUMN last_message_at`);
  }
}
