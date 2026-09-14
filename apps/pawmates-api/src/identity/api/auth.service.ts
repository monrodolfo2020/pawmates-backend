import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  ResourceNotFoundError,
  ValidationError,
  sendVerificationEmail,
  uploadBase64Photo,
} from '@pawmates/common';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import type { Role } from '../domain/entities/account.entity';
import { EmailVerificationCode } from '../domain/entities/email-verification-code.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { ProviderProfile } from '../../providers/domain/entities/provider-profile.entity';

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
    @InjectRepository(ProviderProfile)
    private readonly providerProfiles: Repository<ProviderProfile>,
    private readonly jwt: JwtService,
  ) {}

  async signup(params: {
    email: string;
    password: string;
    role: 'owner' | 'provider';
    name?: string;
    facePhoto?: string;
    idDocumentPhoto?: string;
    profilePhoto?: string;
  }): Promise<AuthResult> {
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

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
      await this.seedInitialProfilePhoto(account.id, params.profilePhoto);
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
      facePhoto?: string;
      idDocumentPhoto?: string;
      profilePhoto?: string;
    },
  ): Promise<AuthResult> {
    const account = await this.accounts.findOneOrFail({
      where: { id: accountId },
    });
    account.addRole(params.role);
    await this.accounts.save(account);

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
      await this.seedInitialProfilePhoto(account.id, params.profilePhoto);
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
    verification.facePhotoBase64 = await uploadBase64Photo(facePhoto, 'verifications');
    verification.idDocumentPhotoBase64 = await uploadBase64Photo(idDocumentPhoto, 'verifications');
    verification.status = 'pending';
    await this.verifications.save(verification);
  }

  /** Optional — lets a new provider start their public page with a photo
   * right away (reusing their just-taken face photo, or a different one
   * they picked) instead of landing on a bare "Editar mi página pública"
   * later. Only ever runs once, at signup/addRole, so there's no existing
   * ProviderProfile yet to clobber; the provider is free to change this
   * photo anytime afterward — unlike facePhoto/idDocumentPhoto above,
   * which stay fixed in ProviderVerification for admin review. */
  private async seedInitialProfilePhoto(
    accountId: string,
    profilePhoto?: string,
  ): Promise<void> {
    if (!profilePhoto) return;
    const profile = ProviderProfile.draft(accountId);
    profile.update({ photo: await uploadBase64Photo(profilePhoto, 'providers') });
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
