import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates every Identity table — for Turso/libSQL, not Postgres (see
 * README's Database section). Table names are prefixed `identity_*`
 * since SQLite has no schema concept to separate them the way
 * `identity.*` did, and there's no `pgcrypto`/`gen_random_uuid()`
 * equivalent — TypeORM generates these UUIDs in the application layer
 * instead (its `@PrimaryGeneratedColumn('uuid')` decorator already does
 * this automatically for any driver that reports it can't generate UUIDs
 * itself, which includes better-sqlite3/libSQL — no entity code changes
 * needed for that).
 */
export class CreateIdentitySchema1700600000000 implements MigrationInterface {
  name = 'CreateIdentitySchema1700600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE identity_accounts (
        id text PRIMARY KEY,
        email text NOT NULL,
        password_hash text NOT NULL,
        name text NULL,
        roles text NOT NULL DEFAULT '[]',
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_accounts_email ON identity_accounts (lower(email))`,
    );

    await queryRunner.query(`
      CREATE TABLE identity_pets (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        name text NOT NULL,
        breed text NOT NULL,
        size text NOT NULL,
        temperament text NOT NULL DEFAULT '[]',
        vaccines text NOT NULL DEFAULT '[]',
        photo_base64 text NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        updated_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_pets_owner ON identity_pets (owner_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE identity_provider_verifications (
        id text PRIMARY KEY,
        account_id text NOT NULL UNIQUE,
        face_photo_base64 text NOT NULL,
        id_document_photo_base64 text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE identity_provider_verifications`);
    await queryRunner.query(`DROP TABLE identity_pets`);
    await queryRunner.query(`DROP TABLE identity_accounts`);
  }
}
