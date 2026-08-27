import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the identity schema — real accounts (email + password, multiple
 * roles), owner-side pets, and provider verification photos. Replaces the
 * dev-login shortcut this MVP started with (see README).
 */
export class CreateIdentitySchema1700200000000 implements MigrationInterface {
  name = 'CreateIdentitySchema1700200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(`
      CREATE TABLE identity.accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        password_hash text NOT NULL,
        name text NULL,
        roles jsonb NOT NULL DEFAULT '[]',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_accounts_email ON identity.accounts (lower(email))`,
    );

    await queryRunner.query(`
      CREATE TABLE identity.pets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id uuid NOT NULL,
        name text NOT NULL,
        breed text NOT NULL,
        size text NOT NULL,
        temperament jsonb NOT NULL DEFAULT '[]',
        vaccines jsonb NOT NULL DEFAULT '[]',
        photo_base64 text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_pets_owner ON identity.pets (owner_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE identity.provider_verifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL UNIQUE,
        face_photo_base64 text NOT NULL,
        id_document_photo_base64 text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA identity CASCADE`);
  }
}
