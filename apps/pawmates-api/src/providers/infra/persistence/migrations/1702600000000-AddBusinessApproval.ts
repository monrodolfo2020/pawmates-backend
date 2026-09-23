import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * New businesses now wait for an admin's approval before appearing
 * publicly.
 *
 * Every business that already exists is approved as of now: they were
 * public yesterday, and a migration that silently took them all out of
 * the directory would be the worst possible way to introduce a review
 * step.
 */
export class AddBusinessApproval1702600000000 implements MigrationInterface {
  name = 'AddBusinessApproval1702600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN approved_at datetime NULL`,
    );
    await queryRunner.query(
      `UPDATE providers_profiles SET approved_at = datetime('now')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN approved_at`);
  }
}
