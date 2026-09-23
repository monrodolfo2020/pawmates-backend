import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The page editor is now free for the first 30 days after a business is
 * approved (see ProviderProfile.startTrial).
 *
 * Businesses already approved get their 30 days starting now — they
 * never had the editor, so counting from their old approval date would
 * hand most of them a trial that's already over.
 */
export class AddPageTrial1702700000000 implements MigrationInterface {
  name = 'AddPageTrial1702700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN trial_ends_at datetime NULL`,
    );
    await queryRunner.query(
      `UPDATE providers_profiles SET trial_ends_at = datetime('now', '+30 days') WHERE approved_at IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles DROP COLUMN trial_ends_at`,
    );
  }
}
