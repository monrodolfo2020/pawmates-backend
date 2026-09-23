import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAccountsController } from './api/admin/admin-accounts.controller';
import { AdminVerificationsController } from './api/admin/admin-verifications.controller';
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
import { ProviderProfile } from '../providers/domain/entities/provider-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Pet,
      ProviderVerification,
      EmailVerificationCode,
      PasswordResetToken,
      LegalAcceptance,
      // Read-only for AdminVerificationsController (its profilePublished
      // field) and written once by AuthService to seed a
      // brand-new provider's public photo at signup (see
      // AuthService.seedInitialProfilePhoto) — ProvidersModule still owns
      // every other write to it via ProvidersController.
      ProviderProfile,
    ]),
  ],
  controllers: [
    AuthController,
    MeController,
    PetsController,
    LegalController,
    AdminAccountsController,
    AdminVerificationsController,
  ],
  providers: [AuthService, AccountDeletionService],
})
export class IdentityModule {}
