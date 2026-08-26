import { IDEMPOTENCY_SERVICE_NAME } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './api/order.controller';
import { ProductController } from './api/product.controller';
import { StorefrontController } from './api/storefront.controller';
import { OrderLineItem } from './domain/entities/order-line-item.entity';
import { Order } from './domain/entities/order.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { Product } from './domain/entities/product.entity';
import { Storefront } from './domain/entities/storefront.entity';
import { RequiresUpcomingBookingPolicy } from './domain/policies/requires-upcoming-booking.policy';
import { BOOKING_PORT } from './domain/ports/booking.port';
import { PAYMENTS_PORT } from './domain/ports/payments.port';
import { TRUST_SAFETY_PORT } from './domain/ports/trust-safety.port';
import { CommerceProcessManager } from './domain/saga/commerce-process-manager';
import { FakeCommercePaymentsAdapter } from './infra/adapters/fake-payments.adapter';
import { FakeTrustSafetyAdapter } from './infra/adapters/fake-trust-safety.adapter';
import { InProcessBookingAdapter } from './infra/adapters/in-process-booking.adapter';
import { BookingModule } from '../booking/booking.module';
import { RedisProvider } from '../infra/redis.provider';

/**
 * Commerce Bounded Context (PawMates Commerce — walker storefronts).
 * Consolidated-MVP shape (see README): Trust & Safety and Payments are
 * Fake in-process adapters, same as booking's; BookingPort is the one
 * *real* adapter this consolidation enables —
 * `RequiresUpcomingBookingPolicy` queries Booking's own repository
 * directly (via importing BookingModule) instead of a gRPC hop.
 */
@Module({
  imports: [
    BookingModule,
    TypeOrmModule.forFeature([
      Storefront,
      Product,
      Order,
      OrderLineItem,
      OutboxEvent,
    ]),
  ],
  controllers: [StorefrontController, ProductController, OrderController],
  providers: [
    CommerceProcessManager,
    RequiresUpcomingBookingPolicy,
    RedisProvider,
    FakeTrustSafetyAdapter,
    FakeCommercePaymentsAdapter,
    InProcessBookingAdapter,
    { provide: TRUST_SAFETY_PORT, useExisting: FakeTrustSafetyAdapter },
    { provide: PAYMENTS_PORT, useExisting: FakeCommercePaymentsAdapter },
    { provide: BOOKING_PORT, useExisting: InProcessBookingAdapter },
    { provide: IDEMPOTENCY_SERVICE_NAME, useValue: 'commerce' },
  ],
  exports: [CommerceProcessManager],
})
export class CommerceModule {}
