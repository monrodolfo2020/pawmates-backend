import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './api/billing.controller';
import { GeoController } from './api/geo.controller';
import { AdminBusinessesController } from './api/admin-businesses.controller';
import { AdminPlanCodesController } from './api/admin-plan-codes.controller';
import { ProvidersController } from './api/providers.controller';
import { ProviderProfile } from './domain/entities/provider-profile.entity';
import { PlanActivationCode } from './domain/entities/plan-activation-code.entity';
import { ProviderPlanActivation } from './domain/entities/provider-plan-activation.entity';
import { BILLING_PORT } from './domain/ports/billing.port';
import { SimulatedBillingAdapter } from './infra/adapters/simulated-billing.adapter';
import { ProviderMarketplaceAdapter } from './infra/adapters/provider-marketplace.adapter';
import { Account } from '../identity/domain/entities/account.entity';
import { ProviderVerification } from '../identity/domain/entities/provider-verification.entity';
import { LegalAcceptance } from '../identity/domain/entities/legal-acceptance.entity';
import { CronController } from './api/cron.controller';
import { ReviewsController } from './api/reviews.controller';
import { PageStatsController } from './api/page-stats.controller';
import { Review } from './domain/entities/review.entity';
import { BusinessInvitation } from './domain/entities/business-invitation.entity';
import { InvitationsController } from './api/invitations.controller';
import { Booking } from '../booking/domain/entities/booking.entity';
import { TrialRemindersService } from './api/trial-reminders.service';

/**
 * Providers Bounded Context — the real Marketplace/provider-directory
 * layer (Fase 0/1 of the "página pública por paseador" plan). Exports
 * TypeOrmModule (not just its own providers) so BookingModule's
 * ProviderMarketplaceAdapter can inject this module's ProviderProfile
 * repository directly.
 *
 * Registers `Account` and `ProviderVerification` from Identity too
 * (read-only — the directory's display name and its "Identidad
 * verificada" badge) rather than importing IdentityModule —
 * IdentityModule doesn't export its TypeOrmModule today, and adding
 * that export just for these two reads felt like more coupling than
 * registering the same entity classes in a second module's forFeature
 * (TypeORM allows this).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderProfile,
      ProviderPlanActivation,
      PlanActivationCode,
      Account,
      ProviderVerification,
      // Written when a provider sends its identity photos from inside
      // the app: that consent has to be recorded like any other.
      LegalAcceptance,
      Review,
      BusinessInvitation,
      // Read-only: a walker is reviewed per booking, so writing a review
      // checks that the booking is the owner's and already took place.
      Booking,
    ]),
  ],
  controllers: [
    ProvidersController,
    BillingController,
    GeoController,
    AdminBusinessesController,
    AdminPlanCodesController,
    CronController,
    ReviewsController,
    PageStatsController,
    InvitationsController,
  ],
  providers: [
    ProviderMarketplaceAdapter,
    TrialRemindersService,
    SimulatedBillingAdapter,
    // No real gateway is wired up yet; swapping this one line is what
    // connecting Stripe or MercadoPago comes down to (see billing.port.ts).
    { provide: BILLING_PORT, useExisting: SimulatedBillingAdapter },
  ],
  exports: [TypeOrmModule, ProviderMarketplaceAdapter],
})
export class ProvidersModule {}
