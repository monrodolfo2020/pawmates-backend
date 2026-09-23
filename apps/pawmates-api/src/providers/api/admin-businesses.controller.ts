import {
  AdminGuard,
  JwtAuthGuard,
  ResourceNotFoundError,
  micrositeQrPng,
  micrositeUrlFor,
  sendBusinessApprovedEmail,
} from '@pawmates/common';
import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { UpdateBusinessApprovalDto } from './dto/update-business-approval.dto';
import { UpdateBusinessPlanDto } from './dto/update-business-plan.dto';

/** Admin panel, "Negocios" tab: every business, approving it to appear
 * publicly, and its plan. */
@Controller('v1/admin/businesses')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminBusinessesController {
  constructor(
    @InjectRepository(ProviderProfile)
    private readonly providerProfiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  @Get()
  async list() {
    const rows = await this.providerProfiles.find({
      order: { createdAt: 'DESC' },
    });
    const accounts = rows.length
      ? await this.accounts.find({
          where: { id: In(rows.map((r) => r.accountId)) },
        })
      : [];
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
        approvedAt: p.approvedAt,
        // What a visitor actually gets: also false while the account is
        // suspended, which hides the business without unpublishing it.
        isPubliclyVisible:
          p.isPubliclyVisible &&
          accountById.get(p.accountId)?.disabledAt === null,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Approves a business to appear publicly, or takes the approval back.
   *
   * Approving emails the business its link and its QR code. The email is
   * a consequence of the approval, not a condition for it: the approval
   * is saved first and stands whether or not the email goes out, and
   * the response says which happened so the panel can tell the admin to
   * pass the link on some other way if it didn't.
   *
   * Only the transition from waiting to approved sends it, so approving
   * twice doesn't spam the business.
   */
  @Patch(':accountId/approval')
  async updateApproval(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBusinessApprovalDto,
  ) {
    const profile = await this.findOrThrow(accountId);
    const wasApproved = profile.approvedAt !== null;
    profile.approvedAt = dto.approved
      ? (profile.approvedAt ?? new Date())
      : null;
    await this.providerProfiles.save(profile);

    let email: { sent: boolean; reason?: string } | null = null;
    if (dto.approved && !wasApproved) {
      email = await this.emailApprovedBusiness(profile);
    }

    return {
      data: {
        accountId: profile.accountId,
        approvedAt: profile.approvedAt,
        isPublished: profile.isPublished,
        email,
      },
    };
  }

  /**
   * Turns VIP on or off for one business by hand — for a charge that
   * happened outside the app (see business-plan.ts; activation codes are
   * the other way, see AdminPlanCodesController). Downgrading leaves the
   * business's saved design untouched but stops serving it (see
   * ProviderProfile.effectiveDesign), so re-upgrading restores the page
   * exactly as it was.
   */
  @Patch(':accountId/plan')
  async updatePlan(
    @Param('accountId') accountId: string,
    @Body() dto: UpdateBusinessPlanDto,
  ) {
    const profile = await this.findOrThrow(accountId);
    profile.setPlan(dto.plan);
    await this.providerProfiles.save(profile);
    return { data: { accountId: profile.accountId, plan: profile.plan } };
  }

  private async findOrThrow(accountId: string): Promise<ProviderProfile> {
    const profile = await this.providerProfiles.findOne({
      where: { accountId },
    });
    if (!profile) {
      throw new ResourceNotFoundError(`El negocio ${accountId} no existe.`);
    }
    return profile;
  }

  private async emailApprovedBusiness(
    profile: ProviderProfile,
  ): Promise<{ sent: boolean; reason?: string }> {
    const owner = await this.accounts.findOne({
      where: { id: profile.accountId },
    });
    if (!owner) return { sent: false, reason: 'La cuenta ya no existe.' };
    if (!profile.slug) {
      return {
        sent: false,
        reason:
          'El negocio todavía no tiene enlace: se crea al guardar su página por primera vez.',
      };
    }
    try {
      const png = await micrositeQrPng(profile.slug);
      // Absolute, because it's read by an email client, not by our app.
      // Falls back to the production backend so the image isn't a broken
      // relative link when API_URL isn't set; the PNG attachment carries
      // the code either way.
      const api = (
        process.env.API_URL ?? 'https://pawmates-backend-black.vercel.app'
      ).replace(/\/$/, '');
      const result = await sendBusinessApprovedEmail({
        to: owner.email,
        businessName: profile.businessName ?? owner.name ?? 'Tu negocio',
        pageUrl: micrositeUrlFor(profile.slug),
        qrImageUrl: `${api}/v1/providers/by-slug/${profile.slug}/qr.png`,
        qrPngBase64: png.toString('base64'),
        pageIsLive: profile.isPublished,
      });
      return result.sent
        ? { sent: true }
        : { sent: false, reason: result.reason };
    } catch {
      return { sent: false, reason: 'No se pudo preparar el correo.' };
    }
  }
}
