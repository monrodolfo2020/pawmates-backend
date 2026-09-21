import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The VIP plan and the micro-page design it unlocks — see
 * business-plan.ts and page-design.ts. Existing businesses all start on
 * 'free' with no design, which renders exactly the fixed page they
 * already had.
 */
export class AddBusinessPlanAndDesign1701900000000 implements MigrationInterface {
  name = 'AddBusinessPlanAndDesign1701900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN plan text NOT NULL DEFAULT 'free'`,
    );
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN design_draft text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN design_published text NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN design_published`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN design_draft`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN plan`);
  }
}
