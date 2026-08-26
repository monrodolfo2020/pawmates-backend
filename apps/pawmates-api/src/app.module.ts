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
import { CommerceModule } from './commerce/commerce.module';
import { OrderLineItem } from './commerce/domain/entities/order-line-item.entity';
import { Order } from './commerce/domain/entities/order.entity';
import { OutboxEvent as CommerceOutboxEvent } from './commerce/domain/entities/outbox-event.entity';
import { Product } from './commerce/domain/entities/product.entity';
import { Storefront } from './commerce/domain/entities/storefront.entity';
import { TripsController } from './trips/trips.controller';

/**
 * Consolidated PawMates MVP — Booking and Commerce in one deployable
 * (see README's "Consolidated MVP" section for why). One shared
 * TypeOrmModule.forRoot() covers both Bounded Contexts' entities;
 * BookingModule/CommerceModule each only register their own slice via
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
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'pawmates',
      entities: [
        Booking,
        BookingLine,
        CancellationRecord,
        PriceBreakdown,
        RecurrenceSeries,
        RescheduleRequest,
        BookingOutboxEvent,
        Storefront,
        Product,
        Order,
        OrderLineItem,
        CommerceOutboxEvent,
      ],
      synchronize: false, // schema owned by migrations
    }),
    BookingModule,
    CommerceModule,
  ],
  controllers: [HealthController, TripsController],
})
export class AppModule {}
