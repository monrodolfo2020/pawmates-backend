import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BookingLine } from '../../booking/domain/entities/booking-line.entity';
import { Booking } from '../../booking/domain/entities/booking.entity';
import { CancellationRecord } from '../../booking/domain/entities/cancellation-record.entity';
import { OutboxEvent as BookingOutboxEvent } from '../../booking/domain/entities/outbox-event.entity';
import { PriceBreakdown } from '../../booking/domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from '../../booking/domain/entities/recurrence-series.entity';
import { RescheduleRequest } from '../../booking/domain/entities/reschedule-request.entity';
import { CatalogItem } from '../../commerce/domain/entities/catalog-item.entity';
import { OrderLineItem } from '../../commerce/domain/entities/order-line-item.entity';
import { Order } from '../../commerce/domain/entities/order.entity';
import { OutboxEvent as CommerceOutboxEvent } from '../../commerce/domain/entities/outbox-event.entity';
import { Product } from '../../commerce/domain/entities/product.entity';
import { Storefront } from '../../commerce/domain/entities/storefront.entity';
import { Account } from '../../identity/domain/entities/account.entity';
import { Pet } from '../../identity/domain/entities/pet.entity';
import { ProviderVerification } from '../../identity/domain/entities/provider-verification.entity';

/**
 * Used only by the TypeORM CLI (`npm run migration:run:pawmates-api`) and
 * by tests that spin up a real schema — the app itself gets its
 * connection via TypeOrmModule.forRoot in app.module.ts. Covers every
 * Bounded Context's migrations; they create separate schemas
 * (`identity.*` / `booking.*` / `commerce.*`) so there's no collision
 * running them from one DataSource.
 */
const pawmatesDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'pawmates',
  entities: [
    Account,
    Pet,
    ProviderVerification,
    Booking,
    BookingLine,
    CancellationRecord,
    PriceBreakdown,
    RecurrenceSeries,
    RescheduleRequest,
    BookingOutboxEvent,
    Storefront,
    Product,
    CatalogItem,
    Order,
    OrderLineItem,
    CommerceOutboxEvent,
  ],
  migrations: [
    __dirname + '/../../identity/infra/persistence/migrations/*.{ts,js}',
    __dirname + '/../../booking/infra/persistence/migrations/*.{ts,js}',
    __dirname + '/../../commerce/infra/persistence/migrations/*.{ts,js}',
  ],
  migrationsTableName: 'migrations_pawmates',
});

export default pawmatesDataSource;
