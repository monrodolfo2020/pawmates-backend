import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './api/admin.controller';
import { LegalController } from './api/legal.controller';
import { AuthController } from './api/auth.controller';
import { AuthService } from './api/auth.service';
import { AccountDeletionService } from './api/account-deletion.service';
import { MeController } from './api/me.controller';
import { PetsController } from './api/pets.controller';
import { Account } from './domain/entities/account.entity';
import { EmailVerificationCode } from './domain/entities/email-verification-code.entity';
import { PasswordResetToken } from './domain/entities/password-reset-token.entity';
import { LegalAcceptance } from './domain/entities/legal-acceptance.entity';
import { Pet } from './domain/entities/pet.entity';
import { ProviderVerification } from './domain/entities/provider-verification.entity';
import { CatalogItem } from '../commerce/domain/entities/catalog-item.entity';
import { Order } from '../commerce/domain/entities/order.entity';
import { Product } from '../commerce/domain/entities/product.entity';
import { Storefront } from '../commerce/domain/entities/storefront.entity';
import { ProviderProfile } from '../providers/domain/entities/provider-profile.entity';
import { PlanActivationCode } from '../providers/domain/entities/plan-activation-code.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Pet,
      ProviderVerification,
      EmailVerificationCode,
      PasswordResetToken,
      LegalAcceptance,
      // Read-only for AdminController's platform-wide oversight — Commerce
      // still owns writes to these via CommerceModule/CommerceProcessManager.
      // CatalogItem is the one exception: admin manages it directly (adding
      // photos, editing suggested prices) — there's no saga step for that.
      Storefront,
      Product,
      Order,
      CatalogItem,
      // Read-only for AdminController (see listVerifications'
      // profilePublished field) and written once by AuthService to seed a
      // brand-new provider's public photo at signup (see
      // AuthService.seedInitialProfilePhoto) — ProvidersModule still owns
      // every other write to it via ProvidersController.
      ProviderProfile,
      // Written by AdminController alone — issuing a VIP activation code
      // is an admin action, while redeeming one belongs to the business
      // and lives in ProvidersModule's BillingController.
      PlanActivationCode,
    ]),
  ],
  controllers: [AuthController, MeController, PetsController, AdminController, LegalController],
  providers: [AuthService, AccountDeletionService],
})
export class IdentityModule {}
