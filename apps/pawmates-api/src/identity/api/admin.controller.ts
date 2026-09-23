import {
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  RoleRequiredError,
  ValidationError,
  classifyStoredPhoto,
  isDataUrl,
  moveToPrivateStorage,
  signedPhotoUrl,
  uploadBase64Photo,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { CatalogItem } from '../../commerce/domain/entities/catalog-item.entity';
import { Order } from '../../commerce/domain/entities/order.entity';
import { Product } from '../../commerce/domain/entities/product.entity';
import { Storefront } from '../../commerce/domain/entities/storefront.entity';
import { UpdateCatalogItemDto } from '../../commerce/api/dto/update-catalog-item.dto';
import { UpdateProviderVerificationDto } from './dto/update-provider-verification.dto';
import { deleteStoredPhoto } from '@pawmates/common';
import { UpdateBusinessPlanDto } from './dto/update-business-plan.dto';
import {
  DeleteAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from './dto/admin-account.dto';
import { AccountDeletionService } from './account-deletion.service';
import { AccountStatusAdapter } from '../infra/adapters/account-status.adapter';
import { CreatePlanCodeDto } from '../../providers/api/dto/create-plan-code.dto';
import { PlanActivationCode } from '../../providers/domain/entities/plan-activation-code.entity';
import { ProviderProfile } from '../../providers/domain/entities/provider-profile.entity';

function toAdminAccount(a: Account) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    roles: a.roles,
    emailVerified: a.emailVerifiedAt !== null,
    disabledAt: a.disabledAt,
    createdAt: a.createdAt,
  };
}

function assertAdmin(account: AuthenticatedAccount): void {
  if (!account.roles.includes('admin')) {
    throw new RoleRequiredError(
      'Esta acción requiere el rol de administrador.',
    );
  }
}

/**
 * Minimal admin surface: see who's registered, and approve or reject
 * provider identity verifications. No signup path grants 'admin' (see
 * README) — the first admin account is promoted by hand, directly in
 * Postgres.
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
    @InjectRepository(ProviderProfile)
    private readonly providerProfiles: Repository<ProviderProfile>,
    @InjectRepository(PlanActivationCode)
    private readonly planCodes: Repository<PlanActivationCode>,
    private readonly deletion: AccountDeletionService,
    private readonly accountStatus: AccountStatusAdapter,
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
        emailVerified: a.emailVerifiedAt !== null,
        disabledAt: a.disabledAt,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Corrects an account's name or email.
   *
   * Roles are deliberately not editable here. Granting 'admin' from a
   * panel is a privilege escalation waiting for a stolen session, and
   * the README's rule is that admins are promoted by hand; switching
   * someone between owner and provider has consequences (a business page,
   * a verification, a different agreement to accept) that a role toggle
   * would skip.
   *
   * A changed email is unverified again: the new address hasn't been
   * proven to belong to the person, and the old verification says
   * nothing about it.
   */
  @Patch('accounts/:id')
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const target = await this.accounts.findOne({ where: { id } });
    if (!target) throw new ResourceNotFoundError('Esa cuenta no existe.');

    if (dto.name !== undefined) {
      target.name = dto.name.trim() || null;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== target.email) {
        const taken = await this.accounts.findOne({ where: { email } });
        if (taken) {
          throw new ValidationError('Ya existe otra cuenta con ese correo.');
        }
        target.email = email;
        target.emailVerifiedAt = null;
      }
    }
    await this.accounts.save(target);
    return { data: toAdminAccount(target) };
  }

  /**
   * Suspends or re-enables an account. A suspended account can't sign
   * in, loses access immediately even with a session already open (see
   * JwtAuthGuard), and — if it's a business — drops out of the directory
   * and its page stops answering. Nothing is deleted, so re-enabling
   * brings everything back as it was.
   */
  @Patch('accounts/:id/status')
  async updateAccountStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAccountStatusDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    if (id === account.accountId) {
      throw new ValidationError('No puedes suspender tu propia cuenta.');
    }
    const target = await this.accounts.findOne({ where: { id } });
    if (!target) throw new ResourceNotFoundError('Esa cuenta no existe.');
    if (target.roles.includes('admin')) {
      throw new ValidationError(
        'Las cuentas de administrador no se suspenden desde el panel.',
      );
    }
    target.disabledAt = dto.enabled ? null : new Date();
    await this.accounts.save(target);
    // Otherwise the guard would keep answering from its cache for a few
    // seconds on this instance.
    this.accountStatus.forget(id);
    return { data: toAdminAccount(target) };
  }

  /** Permanently deletes an account — see AccountDeletionService for
   * what goes and what is kept, and why. */
  @Delete('accounts/:id')
  async deleteAccount(
    @Param('id') id: string,
    @Body() dto: DeleteAccountDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const summary = await this.deletion.delete({
      accountId: id,
      confirmEmail: dto.confirmEmail,
      requestedBy: account.accountId,
    });
    return { data: summary };
  }

  @Get('provider-verifications')
  async listVerifications(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.verifications.find({
      order: { createdAt: 'DESC' },
    });
    const accountIds = rows.map((v) => v.accountId);
    const publishedIds = accountIds.length
      ? new Set(
          (
            await this.providerProfiles.find({
              where: { accountId: In(accountIds), isPublished: true },
            })
          ).map((p) => p.accountId),
        )
      : new Set<string>();
    // These two are private blobs, so the row holds a pathname rather
    // than a usable URL — each response gets its own short-lived signed
    // link (see private-blob-storage.ts). A photo that can't be signed
    // comes back null and renders as a placeholder, so one broken object
    // doesn't take down the whole list.
    const signed = await Promise.all(
      rows.map(async (v) => ({
        id: v.id,
        facePhoto: v.facePhotoBase64 ? await signedPhotoUrl(v.facePhotoBase64) : null,
        idDocumentPhoto: v.idDocumentPhotoBase64
          ? await signedPhotoUrl(v.idDocumentPhotoBase64)
          : null,
      })),
    );
    const signedById = new Map(signed.map((s) => [s.id, s]));

    return {
      data: rows.map((v) => ({
        id: v.id,
        accountId: v.accountId,
        status: v.status,
        facePhoto: signedById.get(v.id)?.facePhoto ?? null,
        idDocumentPhoto: signedById.get(v.id)?.idDocumentPhoto ?? null,
        // Approving identity (this row) and publishing the store page
        // (ProviderProfile — bio + price both set) are independent —
        // this flags a verified/approved paseador who still hasn't
        // finished their page, the thing that actually makes them show
        // up in the shopper-facing directory.
        profilePublished: publishedIds.has(v.accountId),
        photosDeletedAt: v.photosDeletedAt,
        createdAt: v.createdAt,
      })),
    };
  }

  /** Approve or reject a provider's pending identity verification — the
   * one action that turns "no automated check runs against these yet"
   * (see ProviderVerification's comment) into a real decision. Doesn't
   * gate booking eligibility today (see TrustSafetyPort's Fake adapter),
   * only the public "Identidad verificada" badge (see
   * ProvidersController) — deliberately left that way, not a bug. */
  @Patch('provider-verifications/:id')
  async updateVerification(
    @Param('id') id: string,
    @Body() dto: UpdateProviderVerificationDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const verification = await this.verifications.findOne({ where: { id } });
    if (!verification) {
      throw new ResourceNotFoundError(`Verificación ${id} no existe.`);
    }
    verification.status = dto.status;
    // The images existed for this decision and nothing else, so the
    // decision is where they stop. What survives is the outcome and its
    // date — see ProviderVerification's comment.
    await deletePhotosOf(verification);
    await this.verifications.save(verification);
    return {
      data: {
        id: verification.id,
        accountId: verification.accountId,
        status: verification.status,
        photosDeletedAt: verification.photosDeletedAt,
        createdAt: verification.createdAt,
      },
    };
  }

  /** Every registered business with its plan — the list behind the admin
   * panel's "Negocios" tab. */
  @Get('businesses')
  async listBusinesses(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.providerProfiles.find({ order: { createdAt: 'DESC' } });
    const accounts = await this.accounts.find({
      where: { id: In(rows.map((r) => r.accountId)) },
    });
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    return {
      data: rows.map((p) => ({
        accountId: p.accountId,
        name: p.businessName ?? accountById.get(p.accountId)?.name ?? null,
        email: accountById.get(p.accountId)?.email ?? null,
        category: p.category,
        slug: p.slug,
        plan: p.plan,
        isVip: p.isVip(),
        planExpiresAt: p.planExpiresAt,
        isPublished: p.isPublished,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Turns VIP on or off for one business. There's no payment flow yet —
   * the charge happens outside the app and an admin reflects it here
   * (see business-plan.ts). Downgrading leaves the business's saved
   * design untouched but stops serving it (see
   * ProviderProfile.effectiveDesign), so re-upgrading restores the page
   * exactly as it was.
   */
  @Patch('businesses/:accountId/plan')
  async updateBusinessPlan(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBusinessPlanDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const profile = await this.providerProfiles.findOne({ where: { accountId } });
    if (!profile) {
      throw new ResourceNotFoundError(`El negocio ${accountId} no existe.`);
    }
    profile.setPlan(dto.plan);
    await this.providerProfiles.save(profile);
    return { data: { accountId: profile.accountId, plan: profile.plan } };
  }

  /**
   * One-off cleanup for the identity photos uploaded before private
   * storage existed: those sit on the public blob store, where anyone
   * holding the URL can open a provider's face and ID document. This
   * moves each one into private storage and deletes the public original.
   *
   * Idempotent — rows already private, or still holding inline base64,
   * are counted as skipped and left alone. Each row is handled on its
   * own, so one unreachable object doesn't abort the rest; the response
   * says exactly what happened.
   */
  @Post('provider-verifications/secure-legacy-photos')
  async secureLegacyPhotos(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.verifications.find();
    let moved = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const row of rows) {
      const needsWork =
        (row.facePhotoBase64 !== null &&
          classifyStoredPhoto(row.facePhotoBase64) === 'public') ||
        (row.idDocumentPhotoBase64 !== null &&
          classifyStoredPhoto(row.idDocumentPhotoBase64) === 'public');
      if (!needsWork) {
        skipped += 1;
        continue;
      }
      try {
        if (row.facePhotoBase64) {
          row.facePhotoBase64 = await moveToPrivateStorage(
            row.facePhotoBase64,
            'verifications',
          );
        }
        if (row.idDocumentPhotoBase64) {
          row.idDocumentPhotoBase64 = await moveToPrivateStorage(
            row.idDocumentPhotoBase64,
            'verifications',
          );
        }
        await this.verifications.save(row);
        moved += 1;
      } catch {
        failed.push(row.id);
      }
    }

    return { data: { total: rows.length, moved, skipped, failed } };
  }

  /** The activation codes an admin has issued, newest first. */
  @Get('plan-codes')
  async listPlanCodes(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.planCodes.find({ order: { createdAt: 'DESC' }, take: 100 });
    return {
      data: rows.map((c) => ({
        code: c.code,
        period: c.period,
        note: c.note,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        isSpent: c.isSpent,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Issues a code that puts one business on VIP for a period (see
   * PlanActivationCode). This is how a business that paid by transfer
   * gets its plan without an admin having to flip a switch per customer
   * — and unlike that switch, it leaves a record of what was paid for.
   */
  @Post('plan-codes')
  async createPlanCode(
    @Body() dto: CreatePlanCodeDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertAdmin(account);
    const code = PlanActivationCode.generate({
      period: dto.period,
      note: dto.note ?? null,
      maxUses: dto.maxUses ?? 1,
    });
    await this.planCodes.save(code);
    return {
      data: {
        code: code.code,
        period: code.period,
        note: code.note,
        maxUses: code.maxUses,
        usedCount: code.usedCount,
        isSpent: code.isSpent,
        expiresAt: code.expiresAt,
        createdAt: code.createdAt,
      },
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
    if (dto.photo !== undefined) {
      item.photoBase64 =
        dto.photo && isDataUrl(dto.photo)
          ? await uploadBase64Photo(dto.photo, 'catalog')
          : dto.photo;
    }
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

/**
 * Destroys both identity images and records when. Best effort on the
 * storage side: if the object can't be deleted the column is cleared
 * anyway, because a row still pointing at an image we meant to destroy
 * is the worse of the two failures.
 */
async function deletePhotosOf(verification: ProviderVerification): Promise<void> {
  await Promise.all([
    deleteStoredPhoto(verification.facePhotoBase64),
    deleteStoredPhoto(verification.idDocumentPhotoBase64),
  ]);
  verification.facePhotoBase64 = null;
  verification.idDocumentPhotoBase64 = null;
  verification.photosDeletedAt = new Date();
}
