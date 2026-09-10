import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every Product now carries a photo gallery (3-6 images, see
 * Product.photos) instead of no photo at all. Existing rows — including
 * the initial 100-item catalog seed — get `'[]'` (empty gallery, a
 * legacy/transitional state Product's domain validation still accepts;
 * only a nonzero count is held to the 3-6 range going forward).
 */
export class AddProductPhotos1701100000000 implements MigrationInterface {
  name = 'AddProductPhotos1701100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE commerce_products ADD COLUMN photos_base64 text NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE commerce_products DROP COLUMN photos_base64`,
    );
  }
}
