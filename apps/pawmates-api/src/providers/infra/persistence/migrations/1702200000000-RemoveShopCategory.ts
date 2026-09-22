import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Retires the 'shop' category. A store's page is really a product
 * catalogue, which is a different product from a services listing, and
 * asking a shop owner to describe itself with "servicios que ofreces"
 * and "horarios" never fitted.
 *
 * Existing shops become 'other' rather than disappearing: their page,
 * their link and their plan all keep working, and the only visible
 * change is the label on their listing. Deleting them would have taken
 * a published page offline without asking anyone.
 */
export class RemoveShopCategory1702200000000 implements MigrationInterface {
  name = 'RemoveShopCategory1702200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE providers_profiles SET category = 'other' WHERE category = 'shop'`,
    );
  }

  /** Irreversible by design: once they're 'other' there's no record of
   * which ones used to be shops, and inventing one would be worse than
   * leaving them. */
  public async down(): Promise<void> {
    // nothing to undo
  }
}
