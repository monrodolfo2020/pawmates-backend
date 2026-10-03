import {
  AdminGuard,
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  RoleRequiredError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { BusinessInvitation } from '../domain/entities/business-invitation.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { DEFAULT_PAGE_DESIGN } from '../domain/value-objects/page-design';
import { resolveSlug } from './resolve-slug';

/** How many an admin can create in one paste. */
const MAX_PER_BATCH = 200;

/**
 * "Páginas listas para reclamar": PET Conect@ prepares a business's page
 * from its public details and sends it the link; the business sees its
 * page, and claims it by signing up. See BusinessInvitation for why the
 * page is never published before that.
 */
@Controller('v1')
export class InvitationsController {
  constructor(
    @InjectRepository(BusinessInvitation)
    private readonly invitations: Repository<BusinessInvitation>,
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  /** Admin panel, "Invitaciones" tab: every invitation, newest first. */
  @Get('admin/invitations')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async list() {
    const rows = await this.invitations.find({ order: { createdAt: 'DESC' } });
    const claimers = rows.flatMap((r) => (r.claimedBy ? [r.claimedBy] : []));
    const accounts = claimers.length
      ? await this.accounts.find({ where: { id: In(claimers) } })
      : [];
    const emailById = new Map(accounts.map((a) => [a.id, a.email]));
    return {
      data: rows.map((r) => ({
        ...toAdminResponse(r),
        claimedByEmail: r.claimedBy
          ? (emailById.get(r.claimedBy) ?? null)
          : null,
      })),
    };
  }

  /** Creates them all or none: a mistake on one line of the paste
   * shouldn't leave half the list created and the rest to redo. */
  @Post('admin/invitations')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Body() body: { invitations?: unknown }) {
    const items = body?.invitations;
    if (!Array.isArray(items) || items.length === 0) {
      throw new ValidationError('No hay negocios para invitar.');
    }
    if (items.length > MAX_PER_BATCH) {
      throw new ValidationError(
        `Puedes crear como máximo ${MAX_PER_BATCH} invitaciones a la vez.`,
      );
    }
    const created = items.map((item, i) => {
      try {
        return BusinessInvitation.create(
          (item ?? {}) as Parameters<typeof BusinessInvitation.create>[0],
        );
      } catch (err) {
        if (err instanceof ValidationError) {
          throw new ValidationError(`Renglón ${i + 1}: ${err.message}`);
        }
        throw err;
      }
    });
    await this.invitations.manager.transaction((m) => m.save(created));
    return { data: created.map(toAdminResponse) };
  }

  /** Only one nobody has claimed: a claimed one is the record of how
   * that business arrived. */
  @Delete('admin/invitations/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async remove(@Param('id') id: string) {
    const row = await this.invitations.findOne({ where: { id } });
    if (!row) throw new ResourceNotFoundError('Esa invitación no existe.');
    if (row.isClaimed) {
      throw new ValidationError(
        'Esa página ya fue reclamada; no se puede borrar.',
      );
    }
    await this.invitations.delete({ id });
    return { data: { id } };
  }

  /**
   * The preview the link opens — public, because whoever opens it has no
   * account yet. Shaped like a business's public page so the app can
   * draw it exactly as it will look.
   */
  @Get('invitations/:token')
  async preview(@Param('token') token: string) {
    const row = await this.findByToken(token);
    return {
      data: {
        claimed: row.isClaimed,
        category: row.category,
        businessName: row.businessName,
        page: {
          accountId: '',
          name: row.businessName,
          category: row.category,
          slug: null,
          bio: row.bio,
          photo: null,
          photos: [],
          publicAddress: row.publicAddress,
          hours: row.hours,
          whatsapp: row.whatsapp,
          latitude: null,
          longitude: null,
          serviceArea: null,
          specialty: null,
          price: null,
          plansOffered: null,
          services: [],
          walkingSpots: null,
          plan: 'free',
          design: DEFAULT_PAGE_DESIGN,
          emailVerified: false,
          identityVerified: false,
          rating: null,
        },
      },
    };
  }

  /**
   * The business takes the page: its details go into the business's own
   * page (only where that is still empty). Done right after signing up
   * from the link. From here it's an ordinary business: the page shows
   * once its identity is checked and an admin approves it.
   */
  @Post('invitations/:token/claim')
  @UseGuards(JwtAuthGuard)
  async claim(
    @Param('token') token: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (!account.roles.includes('provider')) {
      throw new RoleRequiredError(
        'Para reclamar la página necesitas una cuenta de negocio.',
      );
    }
    const row = await this.findByToken(token);
    const profile =
      (await this.profiles.findOne({
        where: { accountId: account.accountId },
      })) ?? ProviderProfile.draft(account.accountId);
    if (row.isClaimed && row.claimedBy === account.accountId) {
      return { data: { claimed: true } };
    }
    row.claim(profile);
    profile.slug = await resolveSlug(this.profiles, profile);
    await this.profiles.manager.transaction(async (m) => {
      await m.save(profile);
      await m.save(row);
    });
    return { data: { claimed: true } };
  }

  private async findByToken(token: string): Promise<BusinessInvitation> {
    const row = /^[A-Za-z0-9_-]{8,64}$/.test(token)
      ? await this.invitations.findOne({ where: { token } })
      : null;
    if (!row) {
      throw new ResourceNotFoundError(
        'Esta invitación no existe o ya no está disponible.',
      );
    }
    return row;
  }
}

function toAdminResponse(r: BusinessInvitation) {
  return {
    id: r.id,
    token: r.token,
    businessName: r.businessName,
    category: r.category,
    publicAddress: r.publicAddress,
    whatsapp: r.whatsapp,
    hours: r.hours,
    bio: r.bio,
    note: r.note,
    claimedAt: r.claimedAt,
    createdAt: r.createdAt,
  };
}
