import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds real email verification (see AuthController's updated comment —
 * this repo used to explicitly have none). `email_verified_at` on the
 * account itself, plus a one-active-code-per-account table for the OTP
 * flow (see EmailVerificationCode's comment on why it's unhashed).
 */
export class AddEmailVerification1701500000000 implements MigrationInterface {
  name = 'AddEmailVerification1701500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity_accounts ADD COLUMN email_verified_at datetime NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE identity_email_verification_codes (
        id text PRIMARY KEY,
        account_id text NOT NULL UNIQUE,
        code text NOT NULL,
        expires_at datetime NOT NULL,
        consumed_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE identity_email_verification_codes`);
    await queryRunner.query(`ALTER TABLE identity_accounts DROP COLUMN email_verified_at`);
  }
}
