import { IdempotencyKey, resolveJwtSecret } from '@pawmates/common';
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
import { IdentityModule } from './identity/identity.module';
import { AccountStatusModule } from './identity/account-status.module';
import { Account } from './identity/domain/entities/account.entity';
import { EmailVerificationCode } from './identity/domain/entities/email-verification-code.entity';
import { PasswordResetToken } from './identity/domain/entities/password-reset-token.entity';
import { LegalAcceptance } from './identity/domain/entities/legal-acceptance.entity';
import { Pet } from './identity/domain/entities/pet.entity';
import { ProviderVerification } from './identity/domain/entities/provider-verification.entity';
import { libsqlConnectionOptions } from './infra/persistence/libsql-connection';
import { ProvidersModule } from './providers/providers.module';
import { ProviderProfile } from './providers/domain/entities/provider-profile.entity';
import { PlanActivationCode } from './providers/domain/entities/plan-activation-code.entity';
import { ProviderPlanActivation } from './providers/domain/entities/provider-plan-activation.entity';
import { TripsController } from './trips/trips.controller';
import { RateLimitModule } from './infra/rate-limit/rate-limit.module';

/**
 * Consolidated PawMates MVP — Identity, Providers, and Booking in one
 * deployable (see README's "Consolidated MVP" section for why). One
 * shared TypeOrmModule.forRoot() covers every Bounded Context's entities;
 * each feature module only registers its own slice via
 * TypeOrmModule.forFeature().
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // A factory so a missing secret fails the app's startup (which the
    // serverless handler reports) instead of the module import.
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({ secret: resolveJwtSecret() }),
    }),
    RateLimitModule,
    TypeOrmModule.forRoot({
      ...libsqlConnectionOptions(),
      entities: [
        Account,
        Pet,
        ProviderVerification,
        EmailVerificationCode,
        PasswordResetToken,
        LegalAcceptance,
        ProviderProfile,
        ProviderPlanActivation,
        PlanActivationCode,
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
        IdempotencyKey,
      ],
      synchronize: false, // schema owned by migrations
    }),
    AccountStatusModule,
    IdentityModule,
    ProvidersModule,
    BookingModule,
  ],
  controllers: [HealthController, TripsController],
})
export class AppModule {}
