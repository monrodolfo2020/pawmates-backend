import { MigrationInterface, QueryRunner } from 'typeorm';

/** Daily counters of what happens on each business's page — see
 * page-stats.ts. One row per business, day and kind of event. */
export class AddPageStats1703300000000 implements MigrationInterface {
  name = 'AddPageStats1703300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE providers_page_stats (
        provider_id text NOT NULL,
        day text NOT NULL,
        kind text NOT NULL,
        count integer NOT NULL DEFAULT 0,
        PRIMARY KEY (provider_id, day, kind)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers_page_stats`);
  }
}
