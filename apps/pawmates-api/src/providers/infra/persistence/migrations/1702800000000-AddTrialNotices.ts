import { MigrationInterface, QueryRunner } from 'typeorm';

/** Remembers which trial email a business already got (see
 * ProviderProfile.trialNoticeDue), so the daily job sends each once. */
export class AddTrialNotices1702800000000 implements MigrationInterface {
  name = 'AddTrialNotices1702800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN trial_notice_stage text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles DROP COLUMN trial_notice_stage`,
    );
  }
}
