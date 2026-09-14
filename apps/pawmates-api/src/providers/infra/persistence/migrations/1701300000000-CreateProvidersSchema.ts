import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the Providers bounded context's one table — the real Marketplace
 * directory (see ProviderProfile's comment) replacing the old
 * always-available fake-marketplace stub. Table name prefixed `providers_*`, same
 * per-context convention as `identity_*`/`booking_*`/`commerce_*` (see
 * CreateIdentitySchema's comment on why: SQLite/libSQL has no schema
 * concept to separate them the way Postgres did).
 */
export class CreateProvidersSchema1701300000000 implements MigrationInterface {
  name = 'CreateProvidersSchema1701300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE providers_profiles (
        id text PRIMARY KEY,
        account_id text NOT NULL UNIQUE,
        bio text NULL,
        service_area text NULL,
        specialty text NULL,
        photo_base64 text NULL,
        price_amount bigint NULL,
        price_currency text NULL,
        is_published boolean NOT NULL DEFAULT 0,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        updated_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_providers_profiles_published ON providers_profiles (is_published)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers_profiles`);
  }
}
