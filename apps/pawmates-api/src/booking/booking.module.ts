import { IDEMPOTENCY_SERVICE_NAME } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './api/booking.controller';
import { Booking } from './domain/entities/booking.entity';
import { BookingLine } from './domain/entities/booking-line.entity';
import { CancellationRecord } from './domain/entities/cancellation-record.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { PriceBreakdown } from './domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from './domain/entities/recurrence-series.entity';
import { RescheduleRequest } from './domain/entities/reschedule-request.entity';
import { NoDoubleBookingPolicy } from './domain/policies/no-double-booking.policy';
import { MARKETPLACE_PORT } from './domain/ports/marketplace.port';
import { PAYMENTS_PORT } from './domain/ports/payments.port';
import { TRUST_SAFETY_PORT } from './domain/ports/trust-safety.port';
import { BookingProcessManager } from './domain/saga/booking-process-manager';
import { FakeMarketplaceAdapter } from './infra/adapters/fake-marketplace.adapter';
import { FakeBookingPaymentsAdapter } from './infra/adapters/fake-payments.adapter';
import { FakeTrustSafetyAdapter } from './infra/adapters/fake-trust-safety.adapter';
import { RedisProvider } from '../infra/redis.provider';

/**
 * Booking Bounded Context. Consolidated-MVP shape (see README): the three
 * gRPC ports it depends on (Marketplace, Trust & Safety, Payments) are
 * bound to in-process Fake adapters instead of network clients — the
 * saga itself (BookingProcessManager) is unchanged from the multi-service
 * version, since it only ever depended on the port interfaces.
 *
 * Exports `TypeOrmModule` (not just its own providers) so CommerceModule's
 * InProcessBookingAdapter can inject Booking's own repository directly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Booking,
      BookingLine,
      CancellationRecord,
      PriceBreakdown,
      RecurrenceSeries,
      RescheduleRequest,
      OutboxEvent,
    ]),
  ],
  controllers: [BookingController],
  providers: [
    BookingProcessManager,
    NoDoubleBookingPolicy,
    RedisProvider,
    FakeMarketplaceAdapter,
    FakeTrustSafetyAdapter,
    FakeBookingPaymentsAdapter,
    { provide: MARKETPLACE_PORT, useExisting: FakeMarketplaceAdapter },
    { provide: TRUST_SAFETY_PORT, useExisting: FakeTrustSafetyAdapter },
    { provide: PAYMENTS_PORT, useExisting: FakeBookingPaymentsAdapter },
    { provide: IDEMPOTENCY_SERVICE_NAME, useValue: 'booking' },
  ],
  exports: [TypeOrmModule, BookingProcessManager],
})
export class BookingModule {}
