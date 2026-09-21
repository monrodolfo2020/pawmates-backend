import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Turns the walker directory into a pet-services directory: every profile
 * gains a category, a business name and a shareable /s/<slug> address,
 * plus the micro-page fields (gallery, storefront address, hours,
 * WhatsApp). See ProviderProfile and service-category.ts.
 *
 * Existing rows are all walkers, and the publish rule now also requires
 * business_name — so this backfills it from the account's own name and
 * derives a slug from it, keeping every already-published paseador
 * published instead of silently dropping them out of the directory.
 */
export class AddServiceDirectory1701800000000 implements MigrationInterface {
  name = 'AddServiceDirectory1701800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE providers_profiles ADD COLUMN category text NOT NULL DEFAULT 'walker'`,
    );
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN business_name text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN slug text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN photos text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN public_address text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN hours text NULL`);
    await queryRunner.query(`ALTER TABLE providers_profiles ADD COLUMN whatsapp text NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_providers_profiles_slug ON providers_profiles (slug)`,
    );

    // Frozen copy of slugify() — a migration is a historical snapshot, so
    // it must not drift with the domain helper it was written against.
    const slugify = (value: string): string =>
      value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);

    const rows: Array<{ id: string; account_id: string; name: string | null }> =
      await queryRunner.query(
        `SELECT p.id, p.account_id, a.name
           FROM providers_profiles p
           LEFT JOIN identity_accounts a ON a.id = p.account_id`,
      );

    const taken = new Set<string>();
    for (const row of rows) {
      const businessName = row.name?.trim() || 'Paseador';
      let slug = slugify(businessName) || row.account_id.slice(0, 8);
      let suffix = 2;
      while (taken.has(slug)) slug = `${slugify(businessName)}-${suffix++}`;
      taken.add(slug);
      await queryRunner.query(
        `UPDATE providers_profiles SET business_name = ?, slug = ? WHERE id = ?`,
        [businessName, slug, row.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_providers_profiles_slug`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN whatsapp`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN hours`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN public_address`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN photos`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN slug`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN business_name`);
    await queryRunner.query(`ALTER TABLE providers_profiles DROP COLUMN category`);
  }
}
