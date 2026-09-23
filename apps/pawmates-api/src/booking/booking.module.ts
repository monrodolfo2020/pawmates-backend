import { IDEMPOTENCY_SERVICE_NAME, IdempotencyKey } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './api/booking.controller';
import { Booking } from './domain/entities/booking.entity';
import { BookingLine } from './domain/entities/booking-line.entity';
import { BookingMessage } from './domain/entities/booking-message.entity';
import { CancellationRecord } from './domain/entities/cancellation-record.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { PriceBreakdown } from './domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from './domain/entities/recurrence-series.entity';
import { RescheduleRequest } from './domain/entities/reschedule-request.entity';
import { TripLocation } from './domain/entities/trip-location.entity';
import { WalkEvent } from './domain/entities/walk-event.entity';
import { NoDoubleBookingPolicy } from './domain/policies/no-double-booking.policy';
import { MARKETPLACE_PORT } from './domain/ports/marketplace.port';
import { PAYMENTS_PORT } from './domain/ports/payments.port';
import { TRUST_SAFETY_PORT } from './domain/ports/trust-safety.port';
import { BookingProcessManager } from './domain/saga/booking-process-manager';
import { FakeBookingPaymentsAdapter } from './infra/adapters/fake-payments.adapter';
import { FakeTrustSafetyAdapter } from './infra/adapters/fake-trust-safety.adapter';
import { ProviderMarketplaceAdapter } from '../providers/infra/adapters/provider-marketplace.adapter';
import { ProvidersModule } from '../providers/providers.module';
import { Pet } from '../identity/domain/entities/pet.entity';
import { Account } from '../identity/domain/entities/account.entity';

/**
 * Booking Bounded Context. Consolidated-MVP shape (see README): the three
 * gRPC ports it depends on (Marketplace, Trust & Safety, Payments) are
 * bound to in-process Fake adapters instead of network clients — the
 * saga itself (BookingProcessManager) is unchanged from the multi-service
 * version, since it only ever depended on the port interfaces.
 *
 * Exports `TypeOrmModule` (not just its own providers) so TripsController,
 * registered in AppModule, can inject Booking's repositories directly.
 */
@Module({
  imports: [
    ProvidersModule,
    TypeOrmModule.forFeature([
      Booking,
      BookingLine,
      CancellationRecord,
      PriceBreakdown,
      RecurrenceSeries,
      RescheduleRequest,
      TripLocation,
      WalkEvent,
      BookingMessage,
      OutboxEvent,
      IdempotencyKey,
      // Read-only — lets BookingController's list()/getOne() show a pet's
      // name and the owner's name on each booking (e.g. "Toby · Beagle"
      // on the paseador's Dashboard) instead of just bare ids. Identity
      // still owns every write to these.
      Pet,
      Account,
    ]),
  ],
  controllers: [BookingController],
  providers: [
    BookingProcessManager,
    NoDoubleBookingPolicy,
    FakeTrustSafetyAdapter,
    FakeBookingPaymentsAdapter,
    { provide: MARKETPLACE_PORT, useExisting: ProviderMarketplaceAdapter },
    { provide: TRUST_SAFETY_PORT, useExisting: FakeTrustSafetyAdapter },
    { provide: PAYMENTS_PORT, useExisting: FakeBookingPaymentsAdapter },
    { provide: IDEMPOTENCY_SERVICE_NAME, useValue: 'booking' },
  ],
  exports: [TypeOrmModule, BookingProcessManager],
})
export class BookingModule {}
