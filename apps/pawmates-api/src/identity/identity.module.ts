import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './api/admin.controller';
import { AuthController } from './api/auth.controller';
import { AuthService } from './api/auth.service';
import { MeController } from './api/me.controller';
import { PetsController } from './api/pets.controller';
import { Account } from './domain/entities/account.entity';
import { Pet } from './domain/entities/pet.entity';
import { ProviderVerification } from './domain/entities/provider-verification.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Account, Pet, ProviderVerification])],
  controllers: [AuthController, MeController, PetsController, AdminController],
  providers: [AuthService],
})
export class IdentityModule {}
