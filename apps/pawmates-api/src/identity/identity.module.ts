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
import { CatalogItem } from '../commerce/domain/entities/catalog-item.entity';
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
      // CatalogItem is the one exception: admin manages it directly (adding
      // photos, editing suggested prices) — there's no saga step for that.
      Storefront,
      Product,
      Order,
      CatalogItem,
    ]),
  ],
  controllers: [AuthController, MeController, PetsController, AdminController],
  providers: [AuthService],
})
export class IdentityModule {}
