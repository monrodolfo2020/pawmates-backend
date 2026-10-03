import { MigrationInterface, QueryRunner } from 'typeorm';

/** Business pages prepared for a business to claim — see BusinessInvitation. */
export class AddBusinessInvitations1703500000000 implements MigrationInterface {
  name = 'AddBusinessInvitations1703500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE providers_invitations (
        id text PRIMARY KEY NOT NULL,
        token text NOT NULL UNIQUE,
        business_name text NOT NULL,
        category text NOT NULL,
        public_address text NULL,
        whatsapp text NULL,
        hours text NULL,
        bio text NOT NULL,
        note text NULL,
        claimed_by text NULL,
        claimed_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers_invitations`);
  }
}
