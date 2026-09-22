import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores who accepted which version of which legal document, and when.
 * Until now nothing recorded it, which meant the terms and the privacy
 * notice described an acceptance mechanism that left no trace.
 *
 * Existing accounts get no rows: they signed up before there was
 * anything to accept. GET /v1/legal/me reports those documents as
 * pending for them, so they can be asked to accept on next use rather
 * than being backfilled with a consent they never gave.
 */
export class AddLegalAcceptances1702100000000 implements MigrationInterface {
  name = 'AddLegalAcceptances1702100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE identity_legal_acceptances (
        id text PRIMARY KEY NOT NULL,
        account_id text NOT NULL,
        document_type text NOT NULL,
        document_version text NOT NULL,
        ip_address text NULL,
        user_agent text NULL,
        accepted_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_legal_acceptances_account ON identity_legal_acceptances (account_id)`,
    );
    // Re-accepting the same version is a no-op; a new version gets its
    // own row, so the history stays append-only.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_legal_acceptances_unique
         ON identity_legal_acceptances (account_id, document_type, document_version)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_legal_acceptances_unique`);
    await queryRunner.query(`DROP INDEX idx_legal_acceptances_account`);
    await queryRunner.query(`DROP TABLE identity_legal_acceptances`);
  }
}
