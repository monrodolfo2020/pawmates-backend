import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { OrderLineItem } from '../../domain/entities/order-line-item.entity';
import { Order } from '../../domain/entities/order.entity';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { Product } from '../../domain/entities/product.entity';
import { Storefront } from '../../domain/entities/storefront.entity';

/**
 * Used only by the TypeORM CLI (`npm run migration:run:commerce-svc`) and
 * by tests that spin up a real schema — the app itself gets its
 * connection via TypeOrmModule.forRootAsync in commerce.module.ts.
 */
const commerceDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'pawmates',
  entities: [Storefront, Product, Order, OrderLineItem, OutboxEvent],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations_commerce',
});

export default commerceDataSource;
