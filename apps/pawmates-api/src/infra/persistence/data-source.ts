import 'reflect-metadata';
import { IdempotencyKey } from '@pawmates/common';
import { DataSource } from 'typeorm';
import { BookingLine } from '../../booking/domain/entities/booking-line.entity';
import { Booking } from '../../booking/domain/entities/booking.entity';
import { CancellationRecord } from '../../booking/domain/entities/cancellation-record.entity';
import { OutboxEvent as BookingOutboxEvent } from '../../booking/domain/entities/outbox-event.entity';
import { PriceBreakdown } from '../../booking/domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from '../../booking/domain/entities/recurrence-series.entity';
import { RescheduleRequest } from '../../booking/domain/entities/reschedule-request.entity';
import { BookingMessage } from '../../booking/domain/entities/booking-message.entity';
import { TripLocation } from '../../booking/domain/entities/trip-location.entity';
import { WalkEvent } from '../../booking/domain/entities/walk-event.entity';
import { CatalogItem } from '../../commerce/domain/entities/catalog-item.entity';
import { OrderLineItem } from '../../commerce/domain/entities/order-line-item.entity';
import { Order } from '../../commerce/domain/entities/order.entity';
import { OutboxEvent as CommerceOutboxEvent } from '../../commerce/domain/entities/outbox-event.entity';
import { Product } from '../../commerce/domain/entities/product.entity';
import { Storefront } from '../../commerce/domain/entities/storefront.entity';
import { Account } from '../../identity/domain/entities/account.entity';
import { Pet } from '../../identity/domain/entities/pet.entity';
import { ProviderVerification } from '../../identity/domain/entities/provider-verification.entity';
import { libsqlConnectionOptions } from './libsql-connection';

/**
 * Used only by the TypeORM CLI (`npm run migration:run:pawmates-api`) and
 * by tests that spin up a real schema — the app itself gets its
 * connection via TypeOrmModule.forRoot in app.module.ts. Covers every
 * Bounded Context's migrations; table names are prefixed per context
 * (`identity_*` / `booking_*` / `commerce_*`) since SQLite/libSQL has no
 * schema concept to separate them the way Postgres did.
 */
const pawmatesDataSource = new DataSource({
  ...libsqlConnectionOptions(),
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
    TripLocation,
    WalkEvent,
    BookingMessage,
    BookingOutboxEvent,
    Storefront,
    Product,
    CatalogItem,
    Order,
    OrderLineItem,
    CommerceOutboxEvent,
    IdempotencyKey,
  ],
  migrations: [
    __dirname + '/../../identity/infra/persistence/migrations/*.{ts,js}',
    __dirname + '/../../booking/infra/persistence/migrations/*.{ts,js}',
    __dirname + '/../../commerce/infra/persistence/migrations/*.{ts,js}',
    __dirname + '/migrations/*.{ts,js}',
  ],
  migrationsTableName: 'migrations_pawmates',
});

export default pawmatesDataSource;
