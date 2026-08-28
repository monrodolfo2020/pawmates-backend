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
import { Order } from '../commerce/domain/entities/order.entity';
import { Product } from '../commerce/domain/entities/product.entity';
import { Storefront } from '../commerce/domain/entities/storefront.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      Pet,
      ProviderVerification,
      // Read-only for AdminController's platform-wide oversight — Commerce
      // still owns writes to these via CommerceModule/CommerceProcessManager.
      Storefront,
      Product,
      Order,
    ]),
  ],
  controllers: [AuthController, MeController, PetsController, AdminController],
  providers: [AuthService],
})
export class IdentityModule {}
