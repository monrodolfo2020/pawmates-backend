import { CurrentAccount, JwtAuthGuard } from '@pawmates/common';
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

  @Get('me')
  async getMine(@CurrentAccount() account: AuthenticatedAccount) {
    const storefront = await this.storefronts.findOneOrFail({
      where: { providerId: account.accountId },
    });
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
    const storefront = await this.storefronts.findOneOrFail({
      where: { providerId },
    });
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
    const storefront = await this.storefronts.findOneOrFail({
      where: { providerId: account.accountId },
    });
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
