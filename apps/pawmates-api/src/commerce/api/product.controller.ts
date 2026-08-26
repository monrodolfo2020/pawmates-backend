import { CurrentAccount, JwtAuthGuard } from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CommerceProcessManager } from '../domain/saga/commerce-process-manager';
import { UpdateProductDto } from './dto/update-product.dto';
import { toProductResponse } from './storefront.controller';

@Controller('v1/products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly processManager: CommerceProcessManager) {}

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const product = await this.processManager.updateProduct(
      id,
      account.accountId,
      dto,
    );
    return { data: toProductResponse(product) };
  }

  /** Soft delete — a Product is never hard-deleted once an Order may reference it. */
  @Delete(':id')
  async deactivate(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const product = await this.processManager.updateProduct(
      id,
      account.accountId,
      { isActive: false },
    );
    return { data: toProductResponse(product) };
  }
}
