import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProvidersController } from './api/providers.controller';
import { ProviderProfile } from './domain/entities/provider-profile.entity';
import { ProviderMarketplaceAdapter } from './infra/adapters/provider-marketplace.adapter';
import { Account } from '../identity/domain/entities/account.entity';

/**
 * Providers Bounded Context — the real Marketplace/provider-directory
 * layer (Fase 0/1 of the "página pública por paseador" plan). Exports
 * TypeOrmModule (not just its own providers) so BookingModule's
 * ProviderMarketplaceAdapter can inject this module's ProviderProfile
 * repository directly — same pattern BookingModule itself already uses
 * for CommerceModule (see that module's comment).
 *
 * Registers `Account` from Identity too (read-only, for the directory's
 * display name) rather than importing IdentityModule — IdentityModule
 * doesn't export its TypeOrmModule today, and adding that export just
 * for this one read felt like more coupling than registering the same
 * entity class in a second module's forFeature (TypeORM allows this;
 * AdminController's read-only Commerce entities in IdentityModule are
 * the same pattern already in this codebase).
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProviderProfile, Account])],
  controllers: [ProvidersController],
  providers: [ProviderMarketplaceAdapter],
  exports: [TypeOrmModule, ProviderMarketplaceAdapter],
})
export class ProvidersModule {}
