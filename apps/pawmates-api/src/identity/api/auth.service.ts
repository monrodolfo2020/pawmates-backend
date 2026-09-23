import {
  EmailAlreadyRegisteredError,
  AccountDisabledError,
  InvalidCredentialsError,
  ResourceNotFoundError,
  ValidationError,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewBusinessPendingEmail,
  uploadBase64Photo,
  uploadPrivateBase64Photo,
} from '@pawmates/common';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import type { Role } from '../domain/entities/account.entity';
import { EmailVerificationCode } from '../domain/entities/email-verification-code.entity';
import { PasswordResetToken } from '../domain/entities/password-reset-token.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { LegalAcceptance } from '../domain/entities/legal-acceptance.entity';
import { recordAcceptances } from './legal.controller';
import type { LegalDocumentType } from '../domain/value-objects/legal-document';
import { ProviderProfile } from '../../providers/domain/entities/provider-profile.entity';
import type { ServiceCategory } from '../../providers/domain/value-objects/service-category';
import { AccountStatusAdapter } from '../infra/adapters/account-status.adapter';

// Where the emailed reset link points — the deployed frontend, not this
// API (see EXPO_PUBLIC_API_URL's counterpart on that side). Defaults to
// the actual production frontend so a deployment missing this env var
// still sends a working link instead of a broken one.
const APP_URL = process.env.APP_URL ?? 'https://pawmates-one.vercel.app';

/** For the admin's email only. The app has its own copy
 * (CATEGORY_LABELS_SINGULAR); scripts/check-shared-lists.mjs in the
 * frontend repo checks they say the same. */
const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  walker: 'Paseador',
  vet: 'Veterinaria',
  grooming: 'Estética canina',
  boarding: 'Hotel y guardería',
  training: 'Entrenamiento',
  other: 'Otro servicio',
};

const SALT_ROUNDS = 10;

export interface AuthResult {
  accountId: string;
  token: string;
  roles: Role[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
    @InjectRepository(EmailVerificationCode)
    private readonly verificationCodes: Repository<EmailVerificationCode>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
    @InjectRepository(ProviderProfile)
    private readonly providerProfiles: Repository<ProviderProfile>,
    @InjectRepository(LegalAcceptance)
    private readonly legalAcceptances: Repository<LegalAcceptance>,
    private readonly jwt: JwtService,
    // Optional so unit tests can build the service without it.
    @Optional() private readonly accountStatus?: AccountStatusAdapter,
  ) {}

  async signup(
    params: {
      email: string;
      password: string;
      role: 'owner' | 'provider';
      name?: string;
      category?: string;
      businessName?: string;
      facePhoto?: string;
      idDocumentPhoto?: string;
      profilePhoto?: string;
      acceptedLegal: { type: string; version: string }[];
    },
    /** Kept with the acceptance record — it's what makes the record worth
     * anything if the acceptance is ever disputed. */
    context?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<AuthResult> {
    const existing = await this.accounts.findOne({
      where: { email: params.email.toLowerCase() },
    });
    if (existing) {
      throw new EmailAlreadyRegisteredError(
        'Ya existe una cuenta con ese correo.',
      );
    }

    // Photos go up **before** the account exists. They're the only step
    // here that depends on something outside this process, and when that
    // step failed the account had already been written — leaving people
    // who could log in but had no verification and no business page, and
    // who couldn't sign up again because their email was taken. Failing
    // before anything is created means they can simply try again.
    const verificationPhotos =
      params.role === 'provider'
        ? await this.uploadVerificationPhotos(
            params.facePhoto!,
            params.idDocumentPhoto!,
          )
        : null;

    const account = new Account();
    account.email = params.email.toLowerCase();
    account.passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
    account.name = params.name ?? null;
    account.roles = [params.role];
    account.emailVerifiedAt = null;
    await this.accounts.save(account);

    // Written before anything else the account does, so an account can
    // never exist without the record of what it accepted. AuthController
    // has already checked that the required documents are all here and
    // current.
    await recordAcceptances(this.legalAcceptances, {
      accountId: account.id,
      documents: params.acceptedLegal.map((a) => ({
        type: a.type as LegalDocumentType,
        version: a.version,
      })),
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    if (params.role === 'provider' && verificationPhotos) {
      await this.saveVerification(account.id, verificationPhotos);
      await this.seedProviderProfile(account, params);
      // Awaited, because on Vercel work left running after the response
      // can be frozen before it finishes. It can't fail the signup —
      // notifyAdminsOfNewBusiness swallows every error and the send has
      // its own timeout — and the business is in the review queue either
      // way, whether or not the email lands.
      await this.notifyAdminsOfNewBusiness(account, params);
    }

    // Fire-and-forget — a slow or misconfigured email provider (see
    // sendVerificationEmail's comment on RESEND_API_KEY) should never
    // fail signup itself; the account can always request a fresh code
    // later via POST /v1/auth/send-verification-email.
    void this.dispatchVerificationEmail(account);

    return this.issueToken(account);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const account = await this.accounts.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new InvalidCredentialsError('Correo o contraseña incorrectos.');
    }
    // Checked only after the password, so a suspension can't be used to
    // find out which emails have accounts.
    if (account.disabledAt) {
      throw new AccountDisabledError(
        'Tu cuenta está suspendida. Escríbenos si crees que es un error.',
      );
    }
    return this.issueToken(account);
  }

  async addRole(
    accountId: string,
    params: {
      role: 'owner' | 'provider';
      category?: string;
      businessName?: string;
      facePhoto?: string;
      idDocumentPhoto?: string;
      profilePhoto?: string;
      acceptedLegal: { type: string; version: string }[];
    },
    context?: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<AuthResult> {
    const account = await this.accounts.findOneOrFail({
      where: { id: accountId },
    });
    account.addRole(params.role);
    await this.accounts.save(account);
    // Permissions are read from the account (see JwtAuthGuard), so the new
    // role has to reach the cached copy now, not in ten seconds.
    this.accountStatus?.forget(account.id);

    // An owner becoming a business has to accept the provider agreement
    // — it governs a relationship they didn't have until this call, so
    // the acceptance they gave at signup doesn't cover it.
    await recordAcceptances(this.legalAcceptances, {
      accountId: account.id,
      documents: params.acceptedLegal.map((a) => ({
        type: a.type as LegalDocumentType,
        version: a.version,
      })),
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        await this.uploadVerificationPhotos(
          params.facePhoto!,
          params.idDocumentPhoto!,
        ),
      );
      await this.seedProviderProfile(account, params);
      await this.notifyAdminsOfNewBusiness(account, params);
    }

    return this.issueToken(account);
  }

  /**
   * Private storage, not the public one every other photo uses: these two
   * are a face and an official ID document, and the only reader is the
   * admin reviewing them (see private-blob-storage.ts).
   *
   * In parallel, because each upload has its own timeout before it gives
   * up and keeps the image inline — in sequence the worst case was twice
   * as long, on a request that already has a 30-second budget on Vercel.
   */
  private async uploadVerificationPhotos(
    facePhoto: string,
    idDocumentPhoto: string,
  ): Promise<{ face: string; idDocument: string }> {
    const [face, idDocument] = await Promise.all([
      uploadPrivateBase64Photo(facePhoto, 'verifications'),
      uploadPrivateBase64Photo(idDocumentPhoto, 'verifications'),
    ]);
    return { face, idDocument };
  }

  private async saveVerification(
    accountId: string,
    photos: { face: string; idDocument: string },
  ): Promise<void> {
    const existing = await this.verifications.findOne({
      where: { accountId },
    });
    if (existing) return; // already on file — don't overwrite a pending/verified record here
    const verification = new ProviderVerification();
    verification.accountId = accountId;
    verification.facePhotoBase64 = photos.face;
    verification.idDocumentPhotoBase64 = photos.idDocument;
    verification.status = 'pending';
    await this.verifications.save(verification);
  }

  /** Gives a brand-new business its directory listing up front — the
   * category it picked at signup and a name to show (its own, or the
   * person's as a fallback), plus optionally the photo it chose there
   * ("Usar esta fotografía", reusing the just-taken face photo or a
   * different one). Without this the business would land on a completely
   * blank "Editar mi página pública" and wouldn't even know which
   * category it registered as. Only ever runs once, at signup/addRole,
   * so there's no existing ProviderProfile to clobber; everything here
   * stays editable afterward — unlike facePhoto/idDocumentPhoto, which
   * stay fixed in ProviderVerification for admin review.
   *
   * No slug yet: ProvidersController assigns that on the first real save
   * (it's the only layer that can check the table for collisions). */
  private async seedProviderProfile(
    account: Account,
    params: { category?: string; businessName?: string; profilePhoto?: string },
  ): Promise<void> {
    const profile = ProviderProfile.draft(account.id);
    profile.update({
      category: params.category,
      businessName: params.businessName ?? account.name,
      photo: params.profilePhoto
        ? await uploadBase64Photo(params.profilePhoto, 'providers')
        : undefined,
    });
    await this.providerProfiles.save(profile);
  }

  /** Issues a fresh code (replacing any still-active one — see
   * EmailVerificationCode's comment) and emails it. Public: also used by
   * POST /v1/auth/send-verification-email to resend after the first
   * code expired or never arrived. */
  async sendVerificationEmail(accountId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) throw new ResourceNotFoundError('Cuenta no encontrada.');
    if (account.emailVerifiedAt) {
      throw new ValidationError('Tu correo ya está verificado.');
    }
    await this.dispatchVerificationEmail(account);
  }

  async verifyEmail(accountId: string, code: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) throw new ResourceNotFoundError('Cuenta no encontrada.');
    if (account.emailVerifiedAt) return; // already verified — idempotent

    const record = await this.verificationCodes.findOne({
      where: { accountId },
    });
    if (!record) {
      throw new ValidationError('Pide un código nuevo antes de verificar.');
    }
    record.assertValid(code);
    record.consume();
    await this.verificationCodes.save(record);

    account.markEmailVerified();
    await this.accounts.save(account);
  }

  /** Always succeeds from the caller's perspective, whether or not the
   * email is actually registered — revealing that would let anyone probe
   * which emails have PawMates accounts. Silently no-ops when there's no
   * match instead of throwing ResourceNotFoundError. */
  async requestPasswordReset(email: string): Promise<void> {
    const account = await this.accounts.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!account) return;

    const existing = await this.passwordResetTokens.findOne({
      where: { accountId: account.id },
    });
    const record = existing ?? PasswordResetToken.issue(account.id);
    if (existing) {
      // Overwrite in place — one active token per account (unique
      // account_id), same reissue pattern as EmailVerificationCode.
      const fresh = PasswordResetToken.issue(account.id);
      record.token = fresh.token;
      record.expiresAt = fresh.expiresAt;
      record.consumedAt = null;
    }
    await this.passwordResetTokens.save(record);

    const resetLink = `${APP_URL}/reset-password?token=${record.token}`;
    try {
      await sendPasswordResetEmail(account.email, resetLink);
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar el correo de restablecimiento a ${account.email}: ${(err as Error).message}`,
      );
    }
  }

  /** Returns the account's email, so the caller can lift a login
   * lockout: proving you own the inbox is the way out of one. */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const record = await this.passwordResetTokens.findOne({ where: { token } });
    if (!record) {
      throw new ValidationError('Este enlace no es válido. Pide uno nuevo.');
    }
    record.assertValid();
    record.consume();
    await this.passwordResetTokens.save(record);

    const account = await this.accounts.findOneOrFail({
      where: { id: record.accountId },
    });
    account.setPasswordHash(await bcrypt.hash(newPassword, SALT_ROUNDS));
    await this.accounts.save(account);
    return account.email;
  }

  private async dispatchVerificationEmail(account: Account): Promise<void> {
    const existing = await this.verificationCodes.findOne({
      where: { accountId: account.id },
    });
    const record = existing ?? EmailVerificationCode.issue(account.id);
    if (existing) {
      // Overwrite in place — one active code per account (unique
      // account_id), so re-issuing means replacing, not inserting.
      const fresh = EmailVerificationCode.issue(account.id);
      record.code = fresh.code;
      record.expiresAt = fresh.expiresAt;
      record.consumedAt = null;
    }
    await this.verificationCodes.save(record);

    try {
      await sendVerificationEmail(account.email, record.code);
    } catch (err) {
      this.logger.warn(
        `No se pudo enviar el correo de verificación a ${account.email}: ${(err as Error).message}`,
      );
    }
  }

  private async notifyAdminsOfNewBusiness(
    account: Account,
    params: { businessName?: string; category?: string },
  ): Promise<void> {
    try {
      const admins = await this.accounts
        .createQueryBuilder('a')
        .where('a.roles LIKE :admin', { admin: '%"admin"%' })
        .andWhere('a.disabled_at IS NULL')
        .getMany();
      const to = admins.map((a) => a.email);
      if (to.length === 0) return;
      await sendNewBusinessPendingEmail({
        to,
        businessName:
          params.businessName?.trim() || account.name || account.email,
        ownerName: account.name,
        email: account.email,
        // Already validated against SERVICE_CATEGORIES by the DTO.
        category:
          CATEGORY_LABELS[(params.category ?? 'walker') as ServiceCategory] ??
          'Otro servicio',
        adminUrl: `${APP_URL}/admin`,
      });
    } catch (error) {
      console.error('[auth] no se pudo avisar a los administradores', error);
    }
  }

  private async issueToken(account: Account): Promise<AuthResult> {
    const token = await this.jwt.signAsync({
      sub: account.id,
      roles: account.roles,
    });
    return { accountId: account.id, token, roles: account.roles };
  }
}
