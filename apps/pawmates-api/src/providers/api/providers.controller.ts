import {
  CurrentAccount,
  JwtAuthGuard,
  Money,
  ResourceNotFoundError,
  RoleRequiredError,
  ValidationError,
  isDataUrl,
  uploadBase64Photo,
  uploadPrivateBase64Photo,
  micrositeQrPng,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderVerification } from '../../identity/domain/entities/provider-verification.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { SERVICE_CATEGORIES, slugify } from '../domain/value-objects/service-category';
import type { ServiceCategory } from '../domain/value-objects/service-category';
import { SaveProviderProfileDto } from './dto/save-provider-profile.dto';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { LegalAcceptance } from '../../identity/domain/entities/legal-acceptance.entity';
import {
  LEGAL_DOCUMENT_VERSIONS,
  isCurrentVersion,
} from '../../identity/domain/value-objects/legal-document';

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
    @InjectRepository(LegalAcceptance)
    private readonly legalAcceptances: Repository<LegalAcceptance>,
  ) {}

  /** Public directory — only published profiles, optionally narrowed to
   * one category. Free-text search stays on the client: the list is small
   * enough to filter instantly there without a round trip. */
  @Get()
  async list(@Query('category') category?: string) {
    const isKnownCategory = SERVICE_CATEGORIES.includes(category as ServiceCategory);
    // Complete *and* approved: a business waiting for an admin's
    // approval can prepare its page, but doesn't appear here yet.
    const visible = { isPublished: true, approvedAt: Not(IsNull()) };
    const rows = await this.profiles.find({
      where: isKnownCategory
        ? { ...visible, category: category as ServiceCategory }
        : visible,
      order: { createdAt: 'DESC' },
    });
    const accountIds = rows.map((r) => r.accountId);
    const accountById = await this.loadAccounts(accountIds);
    const verifiedIds = await this.loadVerifiedIds(accountIds);
    // A suspended business drops out of the directory without being
    // unpublished, so re-enabling it brings the listing straight back.
    const listed = rows.filter((p) => isActiveAccount(accountById.get(p.accountId)));
    return {
      data: listed.map((p) =>
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
      latitude: dto.latitude,
      longitude: dto.longitude,
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
  /**
   * Where this provider's verification stands. Separate from GET me
   * because that returns null when the business hasn't created its page
   * yet, and the verification card has to show either way — an account
   * whose signup half-failed has neither, and needs to be told so.
   */
  @Get('me/verification')
  @UseGuards(JwtAuthGuard)
  async myVerification(@CurrentAccount() account: AuthenticatedAccount) {
    assertProvider(account);
    const row = await this.verifications.findOne({
      where: { accountId: account.accountId },
    });
    return {
      data: {
        status: row?.status ?? 'none',
        submittedAt: row?.createdAt ?? null,
        photosDeletedAt: row?.photosDeletedAt ?? null,
        consentVersion: LEGAL_DOCUMENT_VERSIONS.identity_verification_consent,
      },
    };
  }

  /**
   * Sends the two identity photos for review, after signup.
   *
   * Until now verification only existed inside the signup request, so a
   * provider whose signup half-failed — or who simply wants to try again
   * with a clearer photo — had no way to be verified at all, and an
   * admin had nothing to approve. That is the gap this closes.
   *
   * Replaces a pending or rejected submission; refuses to touch one that
   * is already verified, since re-submitting would drop a badge the
   * business already earned.
   */
  @Post('me/verification')
  @UseGuards(JwtAuthGuard)
  async submitVerification(
    @Body() dto: SubmitVerificationDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    assertProvider(account);
    if (!isCurrentVersion('identity_verification_consent', dto.consentVersion)) {
      throw new ValidationError(
        'El consentimiento de verificación cambió. Vuelve a cargar la aplicación.',
      );
    }

    const existing = await this.verifications.findOne({
      where: { accountId: account.accountId },
    });
    if (existing?.status === 'verified') {
      throw new ValidationError('Tu identidad ya está verificada.');
    }

    // Uploaded before anything is written, so a storage failure leaves
    // no half-updated row behind.
    const [face, idDocument] = await Promise.all([
      uploadPrivateBase64Photo(dto.facePhoto, 'verifications'),
      uploadPrivateBase64Photo(dto.idDocumentPhoto, 'verifications'),
    ]);

    const verification = existing ?? new ProviderVerification();
    verification.accountId = account.accountId;
    verification.facePhotoBase64 = face;
    verification.idDocumentPhotoBase64 = idDocument;
    verification.photosDeletedAt = null;
    verification.status = 'pending';
    await this.verifications.save(verification);

    await this.legalAcceptances.save(
      LegalAcceptance.record({
        accountId: account.accountId,
        documentType: 'identity_verification_consent',
        documentVersion: dto.consentVersion,
      }),
    ).catch(() => {
      // Already on file from signup — the unique index says so, and
      // re-consenting to the same version is not a new fact.
    });

    return { data: { status: verification.status } };
  }

  /**
   * The QR code for a business's page, as a PNG. Served from here rather
   * than embedded in the email as data because Gmail strips inline data
   * images; the app uses the same address to show and download it.
   *
   * Public, and it only ever encodes our own page address for a slug that
   * exists, so it can't be used as a general QR generator.
   */
  @Get('by-slug/:slug/qr.png')
  async qr(@Param('slug') slug: string, @Res() res: Response) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
      throw new ResourceNotFoundError('Esa página no existe.');
    }
    const exists = await this.profiles.findOne({ where: { slug }, select: { id: true } });
    if (!exists) {
      throw new ResourceNotFoundError('Esa página no existe.');
    }
    const png = await micrositeQrPng(slug);
    res.setHeader('Content-Type', 'image/png');
    // A slug never changes (see resolveSlug), so neither does its code.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename="qr-${slug}.png"`);
    res.send(png);
  }

  @Get('by-slug/:slug')
  async getBySlug(@Param('slug') slug: string) {
    const profile = await this.profiles.findOne({
      where: { slug, isPublished: true, approvedAt: Not(IsNull()) },
    });
    if (!profile) {
      throw new ResourceNotFoundError('Esta página no existe o todavía no está publicada.');
    }
    return { data: await this.detailFor(profile) };
  }

  /** Public detail — 404s for an unpublished/nonexistent profile, same as
   * a shopper hitting a storefront that doesn't exist yet. */
  @Get(':accountId')
  async getPublic(@Param('accountId') accountId: string) {
    const profile = await this.profiles.findOne({
      where: { accountId, isPublished: true, approvedAt: Not(IsNull()) },
    });
    if (!profile) {
      throw new ResourceNotFoundError('Este negocio todavía no tiene una página publicada.');
    }
    return { data: await this.detailFor(profile) };
  }

  private async detailFor(profile: ProviderProfile) {
    const account = await this.accounts.findOne({ where: { id: profile.accountId } });
    // Same message as a page that doesn't exist: a visitor following a
    // shared link has no reason to learn that this business was
    // suspended, and the business has no reason to want them to.
    if (!isActiveAccount(account ?? undefined)) {
      throw new ResourceNotFoundError('Esta página no existe o todavía no está publicada.');
    }
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
    latitude: profile.latitude,
    longitude: profile.longitude,
    serviceArea: profile.serviceArea,
    specialty: profile.specialty,
    price: profile.price,
    plansOffered: profile.plansOffered,
    walkingSpots: profile.walkingSpots,
    // A lapsed VIP is a free page, and says so — `plan` here is what's
    // in force, not what's stored (see ProviderProfile.isVip).
    plan: profile.isVip() ? 'vip' : 'free',
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
    latitude: profile.latitude,
    longitude: profile.longitude,
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
    approvedAt: profile.approvedAt,
    plan: profile.plan,
    isVip: profile.isVip(),
    planExpiresAt: profile.planExpiresAt,
    design: profile.draftDesign,
    publishedDesign: profile.designPublished,
    hasUnpublishedDesign: profile.hasUnpublishedDesign,
  };
}

/** False for a suspended account and for one that's gone. */
function isActiveAccount(account: Account | undefined): boolean {
  return account !== undefined && account.disabledAt === null;
}
