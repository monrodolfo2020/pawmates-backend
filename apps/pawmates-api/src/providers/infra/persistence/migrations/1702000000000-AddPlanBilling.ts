import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives the VIP plan an expiry and the two tables behind it: the audit
 * trail of every activation (including checkouts that were started and
 * never paid) and the activation codes an admin hands out while there's
 * no payment gateway wired up.
 *
 * Existing VIP businesses were switched on by hand and have no billing
 * period behind them, so they keep plan_expires_at NULL — which
 * ProviderProfile.isVip() reads as "doesn't expire". Nobody loses VIP
 * because this migration ran.
 */
export class AddPlanBilling1702000000000 implements MigrationInterface {
  name = 'AddPlanBilling1702000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN plan_expires_at datetime NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE providers_plan_activations (
        id text PRIMARY KEY NOT NULL,
        account_id text NOT NULL,
        period text NOT NULL,
        source text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        reference text NULL,
        amount_cents integer NULL,
        currency text NULL,
        expires_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        activated_at datetime NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_plan_activations_account ON providers_plan_activations (account_id)`,
    );
    // A gateway that retries its webhook must not buy a second period.
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_plan_activations_reference ON providers_plan_activations (reference)`,
    );

    await queryRunner.query(`
      CREATE TABLE providers_plan_codes (
        code text PRIMARY KEY NOT NULL,
        period text NOT NULL,
        note text NULL,
        max_uses integer NOT NULL DEFAULT 1,
        used_count integer NOT NULL DEFAULT 0,
        expires_at datetime NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE providers_plan_codes`);
    await queryRunner.query(`DROP INDEX idx_plan_activations_reference`);
    await queryRunner.query(`DROP INDEX idx_plan_activations_account`);
    await queryRunner.query(`DROP TABLE providers_plan_activations`);
    await queryRunner.query(
      `ALTER TABLE providers_profiles DROP COLUMN plan_expires_at`,
    );
  }
}
