import { MigrationInterface, QueryRunner } from 'typeorm';

/** A business's structured list of services (see BusinessService). */
export class AddServiceCatalog1703000000000 implements MigrationInterface {
  name = 'AddServiceCatalog1703000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN services text NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles DROP COLUMN services`,
    );
  }
}
