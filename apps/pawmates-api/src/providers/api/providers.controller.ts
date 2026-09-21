import {
  CurrentAccount,
  JwtAuthGuard,
  Money,
  ResourceNotFoundError,
  RoleRequiredError,
  isDataUrl,
  uploadBase64Photo,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderVerification } from '../../identity/domain/entities/provider-verification.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { SERVICE_CATEGORIES, slugify } from '../domain/value-objects/service-category';
import type { ServiceCategory } from '../domain/value-objects/service-category';
import { SaveProviderProfileDto } from './dto/save-provider-profile.dto';

/**
 * The pet-services directory: every business's listing plus its
 * shareable micro-page. `GET /v1/providers`, `GET /v1/providers/:accountId`
 * and `GET /v1/providers/by-slug/:slug` are all public — a guest has to
 * be able to open a link a business shared with them without an account.
 */
@Controller('v1/providers')
export class ProvidersController {
  constructor(
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
  ) {}

  /** Public directory — only published profiles, optionally narrowed to
   * one category. Free-text search stays on the client: the list is small
   * enough to filter instantly there without a round trip. */
  @Get()
  async list(@Query('category') category?: string) {
    const isKnownCategory = SERVICE_CATEGORIES.includes(category as ServiceCategory);
    const rows = await this.profiles.find({
      where: isKnownCategory
        ? { isPublished: true, category: category as ServiceCategory }
        : { isPublished: true },
      order: { createdAt: 'DESC' },
    });
    const accountIds = rows.map((r) => r.accountId);
    const accountById = await this.loadAccounts(accountIds);
    const verifiedIds = await this.loadVerifiedIds(accountIds);
    return {
      data: rows.map((p) =>
        toDirectoryResponse(p, accountById.get(p.accountId), verifiedIds.has(p.accountId)),
      ),
    };
  }

  /** A provider's own profile — draft or published, for the edit screen. */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMine(@CurrentAccount() account: AuthenticatedAccount) {
    assertProvider(account);
    const profile = await this.profiles.findOne({ where: { accountId: account.accountId } });
    if (!profile) return { data: null };
    return { data: toOwnResponse(profile) };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async saveMine(
    @Body() dto: SaveProviderProfileDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertProvider(account);
    let profile = await this.profiles.findOne({ where: { accountId: account.accountId } });
    if (!profile) profile = ProviderProfile.draft(account.accountId);

    const photo =
      dto.photo === undefined
        ? undefined
        : dto.photo === ''
          ? null
          : isDataUrl(dto.photo)
            ? await uploadBase64Photo(dto.photo, 'providers')
            : dto.photo;

    // Gallery entries arrive as a mix of brand-new data URLs and the
    // hosted URLs of photos already uploaded on a previous save — only
    // the former need a round trip to Blob.
    const photos =
      dto.photos === undefined
        ? undefined
        : await Promise.all(
            dto.photos.map((entry) =>
              isDataUrl(entry) ? uploadBase64Photo(entry, 'providers') : Promise.resolve(entry),
            ),
          );

    profile.update({
      category: dto.category,
      businessName:
        dto.businessName === undefined ? undefined : dto.businessName === '' ? null : dto.businessName,
      photos,
      publicAddress:
        dto.publicAddress === undefined ? undefined : dto.publicAddress === '' ? null : dto.publicAddress,
      hours: dto.hours === undefined ? undefined : dto.hours === '' ? null : dto.hours,
      whatsapp: dto.whatsapp === undefined ? undefined : dto.whatsapp === '' ? null : dto.whatsapp,
      bio: dto.bio === undefined ? undefined : dto.bio === '' ? null : dto.bio,
      serviceArea:
        dto.serviceArea === undefined ? undefined : dto.serviceArea === '' ? null : dto.serviceArea,
      specialty:
        dto.specialty === undefined ? undefined : dto.specialty === '' ? null : dto.specialty,
      photo,
      price:
        dto.priceAmount === undefined
          ? undefined
          : Money.of(dto.priceAmount, dto.priceCurrency ?? 'MXN'),
      plansOffered:
        dto.plansOffered === undefined ? undefined : dto.plansOffered === '' ? null : dto.plansOffered,
      walkingSpots:
        dto.walkingSpots === undefined ? undefined : dto.walkingSpots === '' ? null : dto.walkingSpots,
      address: dto.address === undefined ? undefined : dto.address === '' ? null : dto.address,
      idNumber: dto.idNumber === undefined ? undefined : dto.idNumber === '' ? null : dto.idNumber,
      age: dto.age === undefined ? undefined : dto.age,
      phone: dto.phone === undefined ? undefined : dto.phone === '' ? null : dto.phone,
    });
    if (dto.design !== undefined) {
      profile.saveDesignDraft(await this.uploadDesignPhotos(dto.design));
    }
    profile.slug = await this.resolveSlug(profile);
    await this.profiles.save(profile);
    return { data: toOwnResponse(profile) };
  }

  /** Copies the draft onto the live page — the "Publicar cambios" button
   * behind the Diseño / En línea split. */
  @Post('me/design/publish')
  @UseGuards(JwtAuthGuard)
  async publishDesign(@CurrentAccount() account: AuthenticatedAccount) {
    assertProvider(account);
    const profile = await this.profiles.findOne({ where: { accountId: account.accountId } });
    if (!profile) {
      throw new ResourceNotFoundError('Todavía no tienes una página que publicar.');
    }
    profile.publishDesign();
    await this.profiles.save(profile);
    return { data: toOwnResponse(profile) };
  }

  /** The design's logo/cover arrive as data URLs the first time and as
   * already-hosted URLs on every later save — same split as the gallery
   * above. */
  private async uploadDesignPhotos(
    design: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const upload = async (value: unknown) =>
      typeof value === 'string' && isDataUrl(value)
        ? await uploadBase64Photo(value, 'providers')
        : value;
    return { ...design, logo: await upload(design.logo), cover: await upload(design.cover) };
  }

  /**
   * Keeps a business's /s/<slug> address stable once it exists: renaming
   * the business doesn't move the page, because links already shared
   * would break. Only assigns one when there isn't one yet, appending
   * -2, -3… when another business already took the obvious slug.
   */
  private async resolveSlug(profile: ProviderProfile): Promise<string | null> {
    if (profile.slug) return profile.slug;
    if (!profile.businessName) return null;
    const base = slugify(profile.businessName) || profile.accountId.slice(0, 8);
    for (let attempt = 0; ; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const clash = await this.profiles.findOne({
        where: { slug: candidate, accountId: Not(profile.accountId) },
      });
      if (!clash) return candidate;
    }
  }

  /** The shareable micro-page's own endpoint. Must be declared before
   * `:accountId` below, or Nest would match "by-slug" as an account id. */
  @Get('by-slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    const profile = await this.profiles.findOne({ where: { slug, isPublished: true } });
    if (!profile) {
      throw new ResourceNotFoundError('Esta página no existe o todavía no está publicada.');
    }
    return { data: await this.detailFor(profile) };
  }

  /** Public detail — 404s for an unpublished/nonexistent profile, same as
   * a shopper hitting a storefront that doesn't exist yet. */
  @Get(':accountId')
  async getPublic(@Param('accountId') accountId: string) {
    const profile = await this.profiles.findOne({ where: { accountId, isPublished: true } });
    if (!profile) {
      throw new ResourceNotFoundError('Este negocio todavía no tiene una página publicada.');
    }
    return { data: await this.detailFor(profile) };
  }

  private async detailFor(profile: ProviderProfile) {
    const account = await this.accounts.findOne({ where: { id: profile.accountId } });
    const verified = await this.verifications.findOne({
      where: { accountId: profile.accountId, status: 'verified' },
    });
    return toDetailResponse(profile, account, verified !== null);
  }

  private async loadAccounts(accountIds: string[]): Promise<Map<string, Account>> {
    if (!accountIds.length) return new Map();
    const rows = await this.accounts.find({ where: { id: In(accountIds) } });
    return new Map(rows.map((a) => [a.id, a]));
  }

  private async loadVerifiedIds(accountIds: string[]): Promise<Set<string>> {
    if (!accountIds.length) return new Set();
    const rows = await this.verifications.find({
      where: { accountId: In(accountIds), status: 'verified' },
    });
    return new Set(rows.map((v) => v.accountId));
  }
}

function assertProvider(account: AuthenticatedAccount): void {
  if (!account.roles.includes('provider')) {
    throw new RoleRequiredError('Esta acción requiere una cuenta de negocio.');
  }
}

/** The business's own name wins; the account holder's name is the
 * fallback for profiles created before businessName existed. */
function displayName(profile: ProviderProfile, account: Account | null | undefined): string {
  return profile.businessName ?? account?.name ?? 'Negocio';
}

// Deliberately excludes address/idNumber/age/phone — those are only for
// the provider themselves and (eventually) admin verification, never for
// an anonymous or logged-in shopper. See ProviderProfile's comment.
function toDirectoryResponse(
  profile: ProviderProfile,
  account: Account | undefined,
  identityVerified: boolean,
) {
  return {
    accountId: profile.accountId,
    name: displayName(profile, account),
    category: profile.category,
    slug: profile.slug,
    photo: profile.photoBase64,
    serviceArea: profile.serviceArea,
    specialty: profile.specialty,
    price: profile.price,
    plansOffered: profile.plansOffered,
    walkingSpots: profile.walkingSpots,
    // Boolean trust signals, not PII — safe to show a shopper, unlike
    // the actual address/idNumber/age/phone above. identityVerified
    // reflects an admin's decision on POST/PATCH
    // /v1/admin/provider-verifications/:id, not the raw face/ID photos
    // themselves (those never leave the admin surface).
    emailVerified: account?.emailVerifiedAt != null,
    identityVerified,
  };
}

// Same private-field exclusion as toDirectoryResponse above.
function toDetailResponse(profile: ProviderProfile, account: Account | null, identityVerified: boolean) {
  return {
    accountId: profile.accountId,
    name: displayName(profile, account),
    category: profile.category,
    slug: profile.slug,
    bio: profile.bio,
    photo: profile.photoBase64,
    photos: profile.photos,
    publicAddress: profile.publicAddress,
    hours: profile.hours,
    whatsapp: profile.whatsapp,
    serviceArea: profile.serviceArea,
    specialty: profile.specialty,
    price: profile.price,
    plansOffered: profile.plansOffered,
    walkingSpots: profile.walkingSpots,
    plan: profile.plan,
    design: profile.effectiveDesign,
    emailVerified: account?.emailVerifiedAt != null,
    identityVerified,
  };
}

// The only response shape that includes the private fields — this is the
// provider looking at (and editing) their own page.
function toOwnResponse(profile: ProviderProfile) {
  return {
    accountId: profile.accountId,
    category: profile.category,
    businessName: profile.businessName,
    slug: profile.slug,
    bio: profile.bio,
    photo: profile.photoBase64,
    photos: profile.photos,
    publicAddress: profile.publicAddress,
    hours: profile.hours,
    whatsapp: profile.whatsapp,
    serviceArea: profile.serviceArea,
    specialty: profile.specialty,
    price: profile.price,
    plansOffered: profile.plansOffered,
    walkingSpots: profile.walkingSpots,
    address: profile.address,
    idNumber: profile.idNumber,
    age: profile.age,
    phone: profile.phone,
    isPublished: profile.isPublished,
    plan: profile.plan,
    design: profile.draftDesign,
    publishedDesign: profile.designPublished,
    hasUnpublishedDesign: profile.hasUnpublishedDesign,
  };
}
