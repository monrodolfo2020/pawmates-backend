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
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderVerification } from '../../identity/domain/entities/provider-verification.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { SaveProviderProfileDto } from './dto/save-provider-profile.dto';

/**
 * The real Marketplace/provider-directory surface (Fase 0/1 of the
 * "página pública por paseador" plan) — replaces the walker directory
 * and profile the app used to render entirely from static mock data.
 * `GET /v1/providers` and `GET /v1/providers/:accountId` are public, the
 * same way StorefrontController's shopper-facing reads are: a guest can
 * browse a paseador's page before creating an account.
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

  /** Public directory — only published profiles (bio + price both set). */
  @Get()
  async list() {
    const rows = await this.profiles.find({
      where: { isPublished: true },
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

    profile.update({
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
    await this.profiles.save(profile);
    return { data: toOwnResponse(profile) };
  }

  /** Public detail — 404s for an unpublished/nonexistent profile, same as
   * a shopper hitting a storefront that doesn't exist yet. */
  @Get(':accountId')
  async getPublic(@Param('accountId') accountId: string) {
    const profile = await this.profiles.findOne({ where: { accountId, isPublished: true } });
    if (!profile) {
      throw new ResourceNotFoundError('Este paseador todavía no tiene una página publicada.');
    }
    const account = await this.accounts.findOne({ where: { id: accountId } });
    const verified = await this.verifications.findOne({
      where: { accountId, status: 'verified' },
    });
    return { data: toDetailResponse(profile, account, verified !== null) };
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
    throw new RoleRequiredError('Esta acción requiere el rol de paseador.');
  }
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
    name: account?.name ?? 'Paseador',
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
    name: account?.name ?? 'Paseador',
    bio: profile.bio,
    photo: profile.photoBase64,
    serviceArea: profile.serviceArea,
    specialty: profile.specialty,
    price: profile.price,
    plansOffered: profile.plansOffered,
    walkingSpots: profile.walkingSpots,
    emailVerified: account?.emailVerifiedAt != null,
    identityVerified,
  };
}

// The only response shape that includes the private fields — this is the
// provider looking at (and editing) their own page.
function toOwnResponse(profile: ProviderProfile) {
  return {
    accountId: profile.accountId,
    bio: profile.bio,
    photo: profile.photoBase64,
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
  };
}
