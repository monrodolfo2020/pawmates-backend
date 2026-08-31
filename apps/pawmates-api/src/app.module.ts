import { IdempotencyKey } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './api/health.controller';
import { BookingModule } from './booking/booking.module';
import { BookingLine } from './booking/domain/entities/booking-line.entity';
import { Booking } from './booking/domain/entities/booking.entity';
import { CancellationRecord } from './booking/domain/entities/cancellation-record.entity';
import { OutboxEvent as BookingOutboxEvent } from './booking/domain/entities/outbox-event.entity';
import { PriceBreakdown } from './booking/domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from './booking/domain/entities/recurrence-series.entity';
import { RescheduleRequest } from './booking/domain/entities/reschedule-request.entity';
import { BookingMessage } from './booking/domain/entities/booking-message.entity';
import { TripLocation } from './booking/domain/entities/trip-location.entity';
import { WalkEvent } from './booking/domain/entities/walk-event.entity';
import { CommerceModule } from './commerce/commerce.module';
import { CatalogItem } from './commerce/domain/entities/catalog-item.entity';
import { OrderLineItem } from './commerce/domain/entities/order-line-item.entity';
import { Order } from './commerce/domain/entities/order.entity';
import { OutboxEvent as CommerceOutboxEvent } from './commerce/domain/entities/outbox-event.entity';
import { Product } from './commerce/domain/entities/product.entity';
import { Storefront } from './commerce/domain/entities/storefront.entity';
import { IdentityModule } from './identity/identity.module';
import { Account } from './identity/domain/entities/account.entity';
import { Pet } from './identity/domain/entities/pet.entity';
import { ProviderVerification } from './identity/domain/entities/provider-verification.entity';
import { libsqlConnectionOptions } from './infra/persistence/libsql-connection';
import { TripsController } from './trips/trips.controller';

/**
 * Consolidated PawMates MVP — Identity, Booking, and Commerce in one
 * deployable (see README's "Consolidated MVP" section for why). One
 * shared TypeOrmModule.forRoot() covers every Bounded Context's entities;
 * each feature module only registers its own slice via
 * TypeOrmModule.forFeature().
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    }),
    TypeOrmModule.forRoot({
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
      synchronize: false, // schema owned by migrations
    }),
    IdentityModule,
    BookingModule,
    CommerceModule,
  ],
  controllers: [HealthController, TripsController],
})
export class AppModule {}
