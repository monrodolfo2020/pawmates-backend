import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs IdempotencyInterceptor (see README's Database section) — moved
 * here from Redis in the Turso migration, since it's not owned by any one
 * Bounded Context.
 */
export class CreateIdempotencyKeys1700800000000 implements MigrationInterface {
  name = 'CreateIdempotencyKeys1700800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        key text PRIMARY KEY,
        response_status int NOT NULL,
        response_body text NOT NULL,
        expires_at datetime NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE idempotency_keys`);
  }
}
