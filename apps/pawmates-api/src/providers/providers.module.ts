import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './api/billing.controller';
import { GeoController } from './api/geo.controller';
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
    ]),
  ],
  controllers: [ProvidersController, BillingController, GeoController],
  providers: [
    ProviderMarketplaceAdapter,
    SimulatedBillingAdapter,
    // No real gateway is wired up yet; swapping this one line is what
    // connecting Stripe or MercadoPago comes down to (see billing.port.ts).
    { provide: BILLING_PORT, useExisting: SimulatedBillingAdapter },
  ],
  exports: [TypeOrmModule, ProviderMarketplaceAdapter],
})
export class ProvidersModule {}
