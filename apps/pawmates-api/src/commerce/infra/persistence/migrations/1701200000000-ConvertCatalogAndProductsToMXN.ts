import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * PawMates Commerce switches its one currency from USD to MXN (~17
 * MXN/USD at the time of this migration). Converts every row still
 * priced in USD — the AddProductCatalog seed and any Product listed
 * from it — leaving MXN rows (a fresh install that seeded directly in
 * MXN) untouched, so this is safe to run either way.
 */
export class ConvertCatalogAndProductsToMXN1701200000000
  implements MigrationInterface
{
  name = 'ConvertCatalogAndProductsToMXN1701200000000';
  private static readonly RATE = 17;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE commerce_catalog_items
       SET suggested_price_amount = ROUND(suggested_price_amount * ${ConvertCatalogAndProductsToMXN1701200000000.RATE}),
           suggested_price_currency = 'MXN'
       WHERE suggested_price_currency = 'USD'`,
    );
    await queryRunner.query(
      `UPDATE commerce_products
       SET price_amount = ROUND(price_amount * ${ConvertCatalogAndProductsToMXN1701200000000.RATE}),
           price_currency = 'MXN'
       WHERE price_currency = 'USD'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE commerce_catalog_items
       SET suggested_price_amount = ROUND(suggested_price_amount / ${ConvertCatalogAndProductsToMXN1701200000000.RATE}),
           suggested_price_currency = 'USD'
       WHERE suggested_price_currency = 'MXN'`,
    );
    await queryRunner.query(
      `UPDATE commerce_products
       SET price_amount = ROUND(price_amount / ${ConvertCatalogAndProductsToMXN1701200000000.RATE}),
           price_currency = 'USD'
       WHERE price_currency = 'MXN'`,
    );
  }
}
