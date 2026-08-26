import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the commerce schema (PawMates Commerce design, Prompt 5
 * follow-up) — walker storefronts, their products, and the orders owners
 * place against them. Not partitioned like booking.bookings: this
 * reference implementation doesn't expect the same write volume, and
 * nothing here is naturally range-queried by a single monotonic column.
 */
export class CreateCommerceSchema1700100000000 implements MigrationInterface {
  name = 'CreateCommerceSchema1700100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS commerce`);

    await queryRunner.query(`
      CREATE TABLE commerce.storefronts (
        id text PRIMARY KEY,
        provider_id uuid NOT NULL UNIQUE,
        name text NOT NULL,
        description text NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE commerce.products (
        id text PRIMARY KEY,
        storefront_id text NOT NULL,
        name text NOT NULL,
        description text NULL,
        price_amount bigint NOT NULL,
        price_currency char(3) NOT NULL,
        stock_quantity int NULL,
        category text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        version int NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_products_storefront ON commerce.products (storefront_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce.orders (
        id text PRIMARY KEY,
        owner_id uuid NOT NULL,
        storefront_id text NOT NULL,
        provider_id uuid NOT NULL,
        status text NOT NULL,
        delivery_booking_id text NULL,
        delivery_window_open_at timestamptz NULL,
        total_amount bigint NOT NULL,
        total_currency char(3) NOT NULL,
        idempotency_key text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        paid_at timestamptz NULL,
        delivered_at timestamptz NULL,
        refunded_at timestamptz NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_orders_owner ON commerce.orders (owner_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_provider_status ON commerce.orders (provider_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_orders_delivery_booking ON commerce.orders (delivery_booking_id)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_orders_owner_idempotency ON commerce.orders (owner_id, idempotency_key)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce.order_line_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id text NOT NULL,
        product_id text NOT NULL,
        name_snapshot text NOT NULL,
        unit_price_amount bigint NOT NULL,
        unit_price_currency char(3) NOT NULL,
        quantity int NOT NULL,
        line_total_amount bigint NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_order_line_items_order ON commerce.order_line_items (order_id)`,
    );

    await queryRunner.query(`
      CREATE TABLE commerce.outbox_events (
        id text PRIMARY KEY,
        topic text NOT NULL,
        event_type text NOT NULL,
        partition_key text NOT NULL,
        payload jsonb NOT NULL,
        trace_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_commerce_outbox_created ON commerce.outbox_events (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA commerce CASCADE`);
  }
}
