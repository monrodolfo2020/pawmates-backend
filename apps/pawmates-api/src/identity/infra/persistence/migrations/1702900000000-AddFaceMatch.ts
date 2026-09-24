import { MigrationInterface, QueryRunner } from 'typeorm';

/** Where the automatic face comparison's result is kept, next to the
 * verification it helps decide (see ProviderVerification). */
export class AddFaceMatch1702900000000 implements MigrationInterface {
  name = 'AddFaceMatch1702900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity_provider_verifications ADD COLUMN face_match_status text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE identity_provider_verifications ADD COLUMN face_match_similarity real NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE identity_provider_verifications ADD COLUMN face_match_checked_at datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity_provider_verifications DROP COLUMN face_match_checked_at`);
    await queryRunner.query(`ALTER TABLE identity_provider_verifications DROP COLUMN face_match_similarity`);
    await queryRunner.query(`ALTER TABLE identity_provider_verifications DROP COLUMN face_match_status`);
  }
}
