import {
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  RoleRequiredError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { CatalogItem } from '../domain/entities/catalog-item.entity';
import { Product } from '../domain/entities/product.entity';
import { Storefront } from '../domain/entities/storefront.entity';
import { CommerceProcessManager } from '../domain/saga/commerce-process-manager';
import { AddProductDto } from './dto/add-product.dto';
import { OpenStorefrontDto } from './dto/open-storefront.dto';

/** PawMates Commerce API — a walker's own storefront and its catalog. */
@Controller('v1/storefronts')
@UseGuards(JwtAuthGuard)
export class StorefrontController {
  constructor(
    private readonly processManager: CommerceProcessManager,
    @InjectRepository(Storefront)
    private readonly storefronts: Repository<Storefront>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(CatalogItem)
    private readonly catalogItems: Repository<CatalogItem>,
  ) {}

  /**
   * Opening a storefront is admin-only for now — not provider
   * self-service. The platform wants to control who's allowed to sell
   * before opening that up; see README.
   */
  @Post()
  async open(
    @Body() dto: OpenStorefrontDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (!account.roles.includes('admin')) {
      throw new RoleRequiredError(
        'Solo un administrador puede crear una tienda.',
      );
    }
    const storefront = await this.processManager.openStorefront(
      {
        providerId: dto.providerId,
        name: dto.name,
        description: dto.description,
      },
      ulid().toLowerCase(),
    );
    return { data: toStorefrontResponse(storefront) };
  }

  /** The admin-curated catalog a provider picks products from — see
   * AddProductCatalog migration. */
  @Get('catalog')
  async listCatalog() {
    const rows = await this.catalogItems.find({
      where: { isActive: true },
      order: { category: 'ASC', name: 'ASC' },
    });
    return { data: rows.map(toCatalogItemResponse) };
  }

  /**
   * Browse every open storefront on the platform — this MVP has no real
   * Marketplace/discovery Bounded Context (see README), so this is how an
   * owner finds a walker's shop rather than through the (mock) walker
   * cards on Home.
   */
  @Get()
  async listActive() {
    const storefronts = await this.storefronts.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    const counts = await this.products
      .createQueryBuilder('p')
      .select('p.storefront_id', 'storefrontId')
      .addSelect('COUNT(*) FILTER (WHERE p.is_active)', 'productCount')
      .where('p.storefront_id IN (:...ids)', {
        ids: storefronts.length ? storefronts.map((s) => s.id) : [''],
      })
      .groupBy('p.storefront_id')
      .getRawMany<{ storefrontId: string; productCount: string }>();
    const countById = new Map(counts.map((c) => [c.storefrontId, Number(c.productCount)]));

    return {
      data: storefronts.map((s) => ({
        ...toStorefrontResponse(s),
        productCount: countById.get(s.id) ?? 0,
      })),
    };
  }

  /** null means this provider hasn't opened a storefront yet — a normal
   * state, not an error (POST here to open one). */
  @Get('me')
  async getMine(@CurrentAccount() account: AuthenticatedAccount) {
    const storefront = await this.storefronts.findOne({
      where: { providerId: account.accountId },
    });
    if (!storefront) return { data: null };

    const products = await this.products.find({
      where: { storefrontId: storefront.id },
    });
    return {
      data: {
        ...toStorefrontResponse(storefront),
        products: products.map(toProductResponse),
      },
    };
  }

  @Get(':providerId')
  async getPublic(@Param('providerId') providerId: string) {
    const storefront = await this.storefronts.findOne({
      where: { providerId },
    });
    if (!storefront) {
      throw new ResourceNotFoundError('Este paseador no tiene una tienda abierta.');
    }
    const products = await this.products.find({
      where: { storefrontId: storefront.id, isActive: true },
    });
    return {
      data: {
        ...toStorefrontResponse(storefront),
        products: products.map(toProductResponse),
      },
    };
  }

  /** Lists a Product from the admin-curated catalog (see AddProductDto) —
   * name/description/category come from the CatalogItem, not the caller. */
  @Post('me/products')
  async addProduct(
    @Body() dto: AddProductDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const storefront = await this.storefronts.findOne({
      where: { providerId: account.accountId },
    });
    if (!storefront) {
      throw new ResourceNotFoundError('Todavía no has abierto tu tienda.');
    }
    const catalogItem = await this.catalogItems.findOne({
      where: { id: dto.catalogItemId, isActive: true },
    });
    if (!catalogItem) {
      throw new ValidationError('Ese producto no existe en el catálogo.');
    }
    const product = await this.processManager.addProduct({
      storefrontId: storefront.id,
      requestedBy: account.accountId,
      catalogItemId: catalogItem.id,
      name: catalogItem.name,
      description: catalogItem.description,
      priceAmount: dto.priceAmount ?? catalogItem.suggestedPriceAmount,
      priceCurrency: dto.priceCurrency ?? catalogItem.suggestedPriceCurrency,
      stockQuantity: dto.stockQuantity,
      category: catalogItem.category,
    });
    return { data: toProductResponse(product) };
  }
}

export function toStorefrontResponse(storefront: Storefront) {
  return {
    id: storefront.id,
    providerId: storefront.providerId,
    name: storefront.name,
    description: storefront.description,
    isActive: storefront.isActive,
  };
}

export function toProductResponse(product: Product) {
  return {
    id: product.id,
    storefrontId: product.storefrontId,
    catalogItemId: product.catalogItemId,
    name: product.name,
    description: product.description,
    price: { amount: product.priceAmount, currency: product.priceCurrency },
    stockQuantity: product.stockQuantity,
    category: product.category,
    isActive: product.isActive,
  };
}

export function toCatalogItemResponse(item: CatalogItem) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category,
    suggestedPrice: { amount: item.suggestedPriceAmount, currency: item.suggestedPriceCurrency },
    photo: item.photoBase64,
  };
}
