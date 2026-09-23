import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Counters for RateLimiter: one row per (rule, subject), e.g.
 * "login-account:ana@correo.com". Kept in the database, not in memory,
 * because on Vercel consecutive requests can land on different
 * instances — an in-memory count would reset whenever that happens.
 */
export class CreateRateLimits1702700000000 implements MigrationInterface {
  name = 'CreateRateLimits1702700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rate_limits (
        key text PRIMARY KEY,
        count integer NOT NULL,
        window_start_ms integer NOT NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE rate_limits`);
  }
}
