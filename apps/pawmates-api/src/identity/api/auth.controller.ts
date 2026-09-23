import {
  ClientIp,
  CurrentAccount,
  InvalidCredentialsError,
  JwtAuthGuard,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { RATE_LIMITS } from '../../infra/rate-limit/rate-limit-rules';
import { AuthService } from './auth.service';
import { AddRoleDto } from './dto/add-role.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import {
  documentsRequiredFor,
  isCurrentVersion,
} from '../domain/value-objects/legal-document';
import type { LegalDocumentType } from '../domain/value-objects/legal-document';
import { VerifyEmailDto } from './dto/verify-email.dto';

/**
 * Real email+password auth, replacing this MVP's original dev-login
 * shortcut. Email verification (see send-verification-email/verify-email
 * below) and password reset (forgot-password/reset-password).
 */
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @ClientIp() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (dto.role === 'provider' && (!dto.facePhoto || !dto.idDocumentPhoto)) {
      throw new ValidationError(
        'Debes subir foto de rostro y de documento para registrar tu negocio.',
      );
    }
    assertAcceptedRequiredDocuments(dto);
    // Only accounts actually created count: a typo that fails validation
    // shouldn't use up someone's allowance.
    await this.limiter.assertAllowed(RATE_LIMITS.signupPerIp, ip);
    const result = await this.auth.signup(dto, { ipAddress: ip, userAgent });
    await this.limiter.record(RATE_LIMITS.signupPerIp, ip);
    return { data: result };
  }

  /**
   * Only wrong passwords count, per email and per connection; a correct
   * one clears the email's count. An email with no account counts the
   * same as one with a wrong password, so the limit can't be used to find
   * out which emails are registered.
   */
  @Post('login')
  async login(@Body() dto: LoginDto, @ClientIp() ip: string) {
    const email = dto.email.trim().toLowerCase();
    await this.limiter.assertAllowed(RATE_LIMITS.loginPerAccount, email);
    await this.limiter.assertAllowed(RATE_LIMITS.loginPerIp, ip);
    try {
      const result = await this.auth.login(email, dto.password);
      await this.limiter.clear(RATE_LIMITS.loginPerAccount, email);
      return { data: result };
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        await Promise.all([
          this.limiter.record(RATE_LIMITS.loginPerAccount, email),
          this.limiter.record(RATE_LIMITS.loginPerIp, ip),
        ]);
      }
      throw err;
    }
  }

  @Post('roles')
  @UseGuards(JwtAuthGuard)
  async addRole(
    @Body() dto: AddRoleDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @ClientIp() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    if (dto.role === 'provider' && (!dto.facePhoto || !dto.idDocumentPhoto)) {
      throw new ValidationError(
        'Debes subir foto de rostro y de documento para registrar tu negocio.',
      );
    }
    assertAcceptedRequiredDocuments(dto);
    const result = await this.auth.addRole(account.accountId, dto, {
      ipAddress: ip,
      userAgent,
    });
    return { data: result };
  }

  /** Resends a fresh code — same one signup already fires in the
   * background, exposed here for when the first email never arrives or
   * its 15-minute window passes. */
  @Post('send-verification-email')
  @UseGuards(JwtAuthGuard)
  async sendVerificationEmail(
    @CurrentAccount() account: AuthenticatedAccount,
    @ClientIp() ip: string,
  ) {
    await this.limiter.consume(RATE_LIMITS.emailPerAddress, account.accountId);
    await this.limiter.consume(RATE_LIMITS.emailPerIp, ip);
    await this.auth.sendVerificationEmail(account.accountId);
    return { data: { sent: true } };
  }

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    await this.limiter.assertAllowed(
      RATE_LIMITS.verifyCodePerAccount,
      account.accountId,
    );
    try {
      await this.auth.verifyEmail(account.accountId, dto.code);
    } catch (err) {
      // A wrong, expired or missing code: 5 of those and the account has
      // to wait, which outlasts the code itself.
      if (err instanceof ValidationError) {
        await this.limiter.record(
          RATE_LIMITS.verifyCodePerAccount,
          account.accountId,
        );
      }
      throw err;
    }
    await this.limiter.clear(
      RATE_LIMITS.verifyCodePerAccount,
      account.accountId,
    );
    return { data: { verified: true } };
  }

  /** No guard — this is how a locked-out (logged-out) person starts the
   * flow. Always reports success regardless of whether the email is
   * registered (see AuthService.requestPasswordReset's comment). */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @ClientIp() ip: string) {
    // Counted whether or not the email has an account, for the same
    // reason the response doesn't say either.
    await this.limiter.consume(RATE_LIMITS.emailPerAddress, dto.email);
    await this.limiter.consume(RATE_LIMITS.emailPerIp, ip);
    await this.auth.requestPasswordReset(dto.email);
    return { data: { sent: true } };
  }

  /** No guard — the reset token from the emailed link is the only
   * credential here, not a session. */
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const email = await this.auth.resetPassword(dto.token, dto.newPassword);
    await this.limiter.clear(RATE_LIMITS.loginPerAccount, email);
    return { data: { reset: true } };
  }
}

/**
 * Refuses a signup that doesn't carry acceptance of every document that
 * account needs, at the version currently in force.
 *
 * Sending the identity photos pulls in one more: the consent for those
 * two images has to be expressed separately from the general acceptance
 * (see legal-document.ts), so a client that asks for verification
 * without it is rejected rather than silently recorded as consenting.
 */
function assertAcceptedRequiredDocuments(dto: SignupDto | AddRoleDto): void {
  const required: LegalDocumentType[] = [...documentsRequiredFor(dto.role)];
  if (dto.facePhoto || dto.idDocumentPhoto) {
    required.push('identity_verification_consent');
  }

  for (const type of required) {
    const accepted = dto.acceptedLegal.find((a) => a.type === type);
    if (!accepted) {
      throw new ValidationError(
        'Debes aceptar los documentos legales para continuar.',
      );
    }
    if (!isCurrentVersion(type, accepted.version)) {
      throw new ValidationError(
        'Los documentos legales cambiaron. Vuelve a cargar la aplicación para revisar la versión vigente.',
      );
    }
  }
}
