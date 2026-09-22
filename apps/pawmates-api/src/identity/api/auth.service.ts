import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  ResourceNotFoundError,
  ValidationError,
  sendVerificationEmail,
  sendPasswordResetEmail,
  uploadBase64Photo,
  uploadPrivateBase64Photo,
} from '@pawmates/common';
import { Injectable, Logger } from '@nestjs/common';
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

// Where the emailed reset link points — the deployed frontend, not this
// API (see EXPO_PUBLIC_API_URL's counterpart on that side). Defaults to
// the actual production frontend so a deployment missing this env var
// still sends a working link instead of a broken one.
const APP_URL = process.env.APP_URL ?? 'https://pawmates-one.vercel.app';

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
  ) {}

  async signup(params: {
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

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
      await this.seedProviderProfile(account, params);
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
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
      await this.seedProviderProfile(account, params);
    }

    return this.issueToken(account);
  }

  private async saveVerification(
    accountId: string,
    facePhoto: string,
    idDocumentPhoto: string,
  ): Promise<void> {
    const existing = await this.verifications.findOne({
      where: { accountId },
    });
    if (existing) return; // already on file — don't overwrite a pending/verified record here
    const verification = new ProviderVerification();
    verification.accountId = accountId;
    // Private storage, not the public one every other photo uses: these
    // two are a face and an official ID document, and the only reader is
    // the admin reviewing them (see private-blob-storage.ts).
    verification.facePhotoBase64 = await uploadPrivateBase64Photo(facePhoto, 'verifications');
    verification.idDocumentPhotoBase64 = await uploadPrivateBase64Photo(
      idDocumentPhoto,
      'verifications',
    );
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

    const record = await this.verificationCodes.findOne({ where: { accountId } });
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

  async resetPassword(token: string, newPassword: string): Promise<void> {
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

  private async issueToken(account: Account): Promise<AuthResult> {
    const token = await this.jwt.signAsync({
      sub: account.id,
      roles: account.roles,
    });
    return { accountId: account.id, token, roles: account.roles };
  }
}
