import { CurrentAccount, JwtAuthGuard, RoleRequiredError, uploadBase64Photos } from '@pawmates/common';
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

/**
 * Admin-only, like the rest of managing the one platform store (see
 * StorefrontController) — CommerceProcessManager.updateProduct() used to
 * enforce this itself (a product's owning storefront had to match the
 * caller), but that stopped meaning anything once there was only one
 * store nobody in particular owns, so the check moved up here instead.
 */
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
    this.assertAdmin(account);
    const product = await this.processManager.updateProduct(id, account.accountId, {
      ...dto,
      photos: dto.photos ? await uploadBase64Photos(dto.photos, 'products') : undefined,
    });
    return { data: toProductResponse(product) };
  }

  /** Soft delete — a Product is never hard-deleted once an Order may reference it. */
  @Delete(':id')
  async deactivate(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    this.assertAdmin(account);
    const product = await this.processManager.updateProduct(
      id,
      account.accountId,
      { isActive: false },
    );
    return { data: toProductResponse(product) };
  }

  private assertAdmin(account: AuthenticatedAccount): void {
    if (!account.roles.includes('admin')) {
      throw new RoleRequiredError('Solo un administrador puede editar productos.');
    }
  }
}
