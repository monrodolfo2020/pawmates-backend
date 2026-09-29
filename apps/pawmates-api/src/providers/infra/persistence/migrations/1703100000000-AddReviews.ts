import { MigrationInterface, QueryRunner } from 'typeorm';

/** Owners' reviews of businesses — see review.entity.ts. */
export class AddReviews1703100000000 implements MigrationInterface {
  name = 'AddReviews1703100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE providers_reviews (
        id text PRIMARY KEY,
        provider_id text NOT NULL,
        owner_id text NOT NULL,
        booking_id text NULL,
        rating integer NOT NULL,
        comment text NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        updated_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_providers_reviews_provider ON providers_reviews (provider_id, created_at)`,
    );
    // One review per booking; one per owner and business when there's no
    // booking (a business that isn't booked through the app).
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_providers_reviews_booking ON providers_reviews (booking_id) WHERE booking_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_providers_reviews_owner ON providers_reviews (owner_id, provider_id) WHERE booking_id IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers_reviews`);
  }
}
