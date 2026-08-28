import {
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  RoleRequiredError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { CatalogItem } from '../../commerce/domain/entities/catalog-item.entity';
import { Order } from '../../commerce/domain/entities/order.entity';
import { Product } from '../../commerce/domain/entities/product.entity';
import { Storefront } from '../../commerce/domain/entities/storefront.entity';
import { UpdateCatalogItemDto } from '../../commerce/api/dto/update-catalog-item.dto';

function assertAdmin(account: AuthenticatedAccount): void {
  if (!account.roles.includes('admin')) {
    throw new RoleRequiredError(
      'Esta acción requiere el rol de administrador.',
    );
  }
}

/**
 * Minimal admin surface: see who's registered and review pending provider
 * verifications. No signup path grants 'admin' (see README) — the first
 * admin account is promoted by hand, directly in Postgres.
 */
@Controller('v1/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
    @InjectRepository(Storefront)
    private readonly storefronts: Repository<Storefront>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(CatalogItem)
    private readonly catalogItems: Repository<CatalogItem>,
  ) {}

  @Get('accounts')
  async listAccounts(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.accounts.find({ order: { createdAt: 'DESC' } });
    return {
      data: rows.map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        roles: a.roles,
        createdAt: a.createdAt,
      })),
    };
  }

  @Get('provider-verifications')
  async listVerifications(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.verifications.find({
      order: { createdAt: 'DESC' },
    });
    return {
      data: rows.map((v) => ({
        id: v.id,
        accountId: v.accountId,
        status: v.status,
        facePhoto: v.facePhotoBase64,
        idDocumentPhoto: v.idDocumentPhotoBase64,
        createdAt: v.createdAt,
      })),
    };
  }

  /** Platform-wide storefront oversight — Commerce's own controllers only
   * ever show a provider their own store or a shopper one store at a time. */
  @Get('storefronts')
  async listStorefronts(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.storefronts.find({ order: { createdAt: 'DESC' } });
    const productCounts = await this.products
      .createQueryBuilder('p')
      .select('p.storefront_id', 'storefrontId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('p.storefront_id')
      .getRawMany<{ storefrontId: string; count: string }>();
    const countById = new Map(productCounts.map((c) => [c.storefrontId, Number(c.count)]));

    const providerIds = rows.map((s) => s.providerId);
    const providers = providerIds.length
      ? await this.accounts.find({ where: { id: In(providerIds) } })
      : [];
    const providerById = new Map(providers.map((p) => [p.id, p]));

    return {
      data: rows.map((s) => ({
        id: s.id,
        providerId: s.providerId,
        providerEmail: providerById.get(s.providerId)?.email ?? null,
        providerName: providerById.get(s.providerId)?.name ?? null,
        name: s.name,
        description: s.description,
        isActive: s.isActive,
        productCount: countById.get(s.id) ?? 0,
        createdAt: s.createdAt,
      })),
    };
  }

  /** Platform-wide order oversight, most recent first. */
  @Get('orders')
  async listOrders(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.orders.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return {
      data: rows.map((o) => ({
        id: o.id,
        ownerId: o.ownerId,
        providerId: o.providerId,
        storefrontId: o.storefrontId,
        status: o.status,
        total: { amount: o.totalAmount, currency: o.totalCurrency },
        createdAt: o.createdAt,
        deliveredAt: o.deliveredAt,
      })),
    };
  }

  /** Every catalog item, including inactive ones — providers only ever see
   * the active subset (GET /v1/storefronts/catalog). */
  @Get('catalog')
  async listCatalog(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.catalogItems.find({
      order: { category: 'ASC', name: 'ASC' },
    });
    return {
      data: rows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        category: c.category,
        suggestedPrice: { amount: c.suggestedPriceAmount, currency: c.suggestedPriceCurrency },
        photo: c.photoBase64,
        isActive: c.isActive,
      })),
    };
  }

  /** Mainly for adding a photo — the catalog seeds with none (see
   * AddProductCatalog migration). */
  @Patch('catalog/:id')
  async updateCatalogItem(
    @Param('id') id: string,
    @Body() dto: UpdateCatalogItemDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const item = await this.catalogItems.findOne({ where: { id } });
    if (!item) throw new ResourceNotFoundError(`Producto de catálogo ${id} no existe.`);

    if (dto.name !== undefined) item.name = dto.name;
    if (dto.description !== undefined) item.description = dto.description;
    if (dto.suggestedPriceAmount !== undefined) item.suggestedPriceAmount = dto.suggestedPriceAmount;
    if (dto.photo !== undefined) item.photoBase64 = dto.photo;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;
    await this.catalogItems.save(item);

    return {
      data: {
        id: item.id,
        name: item.name,
        description: item.description,
        category: item.category,
        suggestedPrice: { amount: item.suggestedPriceAmount, currency: item.suggestedPriceCurrency },
        photo: item.photoBase64,
        isActive: item.isActive,
      },
    };
  }
}
