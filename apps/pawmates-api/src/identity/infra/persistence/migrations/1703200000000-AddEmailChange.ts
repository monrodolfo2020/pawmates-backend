import { MigrationInterface, QueryRunner } from 'typeorm';

/** A pending change of address: the code was sent to new_email, and the
 * account's email becomes it once the code is entered. */
export class AddEmailChange1703200000000 implements MigrationInterface {
  name = 'AddEmailChange1703200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity_email_verification_codes ADD COLUMN new_email text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity_email_verification_codes DROP COLUMN new_email`,
    );
  }
}
