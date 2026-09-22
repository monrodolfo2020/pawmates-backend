import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores where a business is, as a point it picked off an address
 * search (see GeoController).
 *
 * Nullable and left null for every existing row: a paseador works across
 * a zone rather than at an address, and guessing a coordinate from the
 * free-text address already on file would put pins in the wrong place —
 * worse than no pin, since the only thing this powers is the page's
 * "Cómo llegar".
 */
export class AddBusinessLocation1702300000000 implements MigrationInterface {
  name = 'AddBusinessLocation1702300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN latitude real NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN longitude real NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN longitude`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN latitude`);
  }
}
