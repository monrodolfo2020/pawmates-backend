import { MigrationInterface, QueryRunner } from 'typeorm';

/** "Olvidé mi contraseña" — see PasswordResetToken. */
export class AddPasswordReset1701700000000 implements MigrationInterface {
  name = 'AddPasswordReset1701700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE identity_password_reset_tokens (
        id text PRIMARY KEY,
        account_id text NOT NULL UNIQUE,
        token text NOT NULL UNIQUE,
        expires_at datetime NOT NULL,
        consumed_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE identity_password_reset_tokens`);
  }
}
