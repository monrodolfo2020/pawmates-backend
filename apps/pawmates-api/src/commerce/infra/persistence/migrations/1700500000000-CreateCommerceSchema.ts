import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates every Commerce table (PawMates Commerce design) — for
 * Turso/libSQL, not Postgres (see README's Database section). Table
 * names are prefixed `commerce_*` since SQLite has no schema concept to
 * separate them the way `commerce.*` did.
 */
export class CreateCommerceSchema1700500000000 implements MigrationInterface {
  name = 'CreateCommerceSchema1700500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE commerce_storefronts (
        id text PRIMARY KEY,
        provider_id text NOT NULL UNIQUE,
        name text NOT NULL,
        description text NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE commerce_products (
        id text PRIMARY KEY,
        storefront_id text NOT NULL,
        name text NOT NULL,
        description text NULL,
        price_amount bigint NOT NULL,
        price_currency text NOT NULL,
        stock_quantity int NULL,
        category text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        updated_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_products_storefront ON commerce_products (storefront_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce_orders (
        id text PRIMARY KEY,
        owner_id text NOT NULL,
        storefront_id text NOT NULL,
        provider_id text NOT NULL,
        status text NOT NULL,
        delivery_booking_id text NULL,
        delivery_window_open_at datetime NULL,
        total_amount bigint NOT NULL,
        total_currency text NOT NULL,
        idempotency_key text NOT NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now')),
        paid_at datetime NULL,
        delivered_at datetime NULL,
        refunded_at datetime NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_orders_owner ON commerce_orders (owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_provider_status ON commerce_orders (provider_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_delivery_booking ON commerce_orders (delivery_booking_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_orders_owner_idempotency ON commerce_orders (owner_id, idempotency_key)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce_order_line_items (
        id text PRIMARY KEY,
        order_id text NOT NULL,
        product_id text NOT NULL,
        name_snapshot text NOT NULL,
        unit_price_amount bigint NOT NULL,
        unit_price_currency text NOT NULL,
        quantity int NOT NULL,
        line_total_amount bigint NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_order_line_items_order ON commerce_order_line_items (order_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce_outbox_events (
        id text PRIMARY KEY,
        topic text NOT NULL,
        event_type text NOT NULL,
        partition_key text NOT NULL,
        payload text NOT NULL,
        trace_id text NOT NULL,
        created_at datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_commerce_outbox_created ON commerce_outbox_events (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE commerce_outbox_events`);
    await queryRunner.query(`DROP TABLE commerce_order_line_items`);
    await queryRunner.query(`DROP TABLE commerce_orders`);
    await queryRunner.query(`DROP TABLE commerce_products`);
    await queryRunner.query(`DROP TABLE commerce_storefronts`);
  }
}
