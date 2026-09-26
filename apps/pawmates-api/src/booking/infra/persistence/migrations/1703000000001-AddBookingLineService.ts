import { MigrationInterface, QueryRunner } from 'typeorm';

/** Which of the business's services a booking line is for, with its name
 * as it was when booked — the business may rename or remove the service
 * later, and the booking still has to say what was asked for. */
export class AddBookingLineService1703000000001 implements MigrationInterface {
  name = 'AddBookingLineService1703000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE booking_booking_lines ADD COLUMN service_id text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_booking_lines ADD COLUMN service_name text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE booking_booking_lines DROP COLUMN service_name`,
    );
    await queryRunner.query(
      `ALTER TABLE booking_booking_lines DROP COLUMN service_id`,
    );
  }
}
