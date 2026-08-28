import { CurrentAccount, JwtAuthGuard, ResourceNotFoundError } from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
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
  ) {}

  @Post()
  async open(
    @Body() dto: OpenStorefrontDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const storefront = await this.processManager.openStorefront(
      {
        providerId: account.accountId,
        name: dto.name,
        description: dto.description,
      },
      ulid().toLowerCase(),
    );
    return { data: toStorefrontResponse(storefront) };
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
    const product = await this.processManager.addProduct({
      storefrontId: storefront.id,
      requestedBy: account.accountId,
      name: dto.name,
      description: dto.description,
      priceAmount: dto.priceAmount,
      priceCurrency: dto.priceCurrency,
      stockQuantity: dto.stockQuantity,
      category: dto.category,
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
    name: product.name,
    description: product.description,
    price: { amount: product.priceAmount, currency: product.priceCurrency },
    stockQuantity: product.stockQuantity,
    category: product.category,
    isActive: product.isActive,
  };
}
