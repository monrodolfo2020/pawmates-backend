import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lets the identity photos be destroyed once a verification is
 * resolved, keeping only the decision and its date.
 *
 * Two images that together carry a face, a name, a signature and,
 * depending on the document, an address, CURP and voter key have no
 * reason to outlive the review they existed for. SQLite can't drop a NOT
 * NULL constraint in place, so the table is rebuilt.
 *
 * Rows already resolved keep their images until the next review action
 * touches them; the admin panel can clear them on demand.
 */
export class DeleteVerificationPhotosOnReview1702400000000
  implements MigrationInterface
{
  name = 'DeleteVerificationPhotosOnReview1702400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE identity_provider_verifications_new (
        id varchar PRIMARY KEY NOT NULL,
        account_id text NOT NULL,
        face_photo_base64 text NULL,
        id_document_photo_base64 text NULL,
        status text NOT NULL DEFAULT 'pending',
        photos_deleted_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(`
      INSERT INTO identity_provider_verifications_new
        (id, account_id, face_photo_base64, id_document_photo_base64, status, created_at)
      SELECT id, account_id, face_photo_base64, id_document_photo_base64, status, created_at
      FROM identity_provider_verifications
    `);
    await queryRunner.query(`DROP TABLE identity_provider_verifications`);
    await queryRunner.query(
      `ALTER TABLE identity_provider_verifications_new RENAME TO identity_provider_verifications`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_provider_verifications_account
         ON identity_provider_verifications (account_id)`,
    );
  }

  public async down(): Promise<void> {
    // Not reversed: rows whose photos were deleted can't satisfy a NOT
    // NULL constraint again, and inventing placeholder images would be
    // worse than leaving the column nullable.
  }
}
