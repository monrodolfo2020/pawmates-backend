import { MigrationInterface, QueryRunner } from 'typeorm';

/** A business's public answer to a review — see Review.reply. */
export class AddReviewReplies1703400000000 implements MigrationInterface {
  name = 'AddReviewReplies1703400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_reviews ADD COLUMN reply text NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE providers_reviews ADD COLUMN reply_at datetime NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_reviews DROP COLUMN reply_at`,
    );
    await queryRunner.query(`ALTER TABLE providers_reviews DROP COLUMN reply`);
  }
}
