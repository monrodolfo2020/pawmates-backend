import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets an admin suspend an account. Null for every existing row, which
 * is "active": nobody is suspended by this migration.
 */
export class AddAccountDisabled1702500000000 implements MigrationInterface {
  name = 'AddAccountDisabled1702500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity_accounts ADD COLUMN disabled_at datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity_accounts DROP COLUMN disabled_at`);
  }
}
