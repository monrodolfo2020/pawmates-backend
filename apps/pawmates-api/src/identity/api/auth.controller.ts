import {
  CurrentAccount,
  JwtAuthGuard,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AddRoleDto } from './dto/add-role.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

/**
 * Real email+password auth, replacing this MVP's original dev-login
 * shortcut. Email verification (see send-verification-email/verify-email
 * below) and password reset (forgot-password/reset-password).
 */
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    if (dto.role === 'provider' && (!dto.facePhoto || !dto.idDocumentPhoto)) {
      throw new ValidationError(
        'Los paseadores deben subir foto de rostro y de documento.',
      );
    }
    const result = await this.auth.signup(dto);
    return { data: result };
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    const result = await this.auth.login(dto.email, dto.password);
    return { data: result };
  }

  @Post('roles')
  @UseGuards(JwtAuthGuard)
  async addRole(
    @Body() dto: AddRoleDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (dto.role === 'provider' && (!dto.facePhoto || !dto.idDocumentPhoto)) {
      throw new ValidationError(
        'Los paseadores deben subir foto de rostro y de documento.',
      );
    }
    const result = await this.auth.addRole(account.accountId, dto);
    return { data: result };
  }

  /** Resends a fresh code — same one signup already fires in the
   * background, exposed here for when the first email never arrives or
   * its 15-minute window passes. */
  @Post('send-verification-email')
  @UseGuards(JwtAuthGuard)
  async sendVerificationEmail(@CurrentAccount() account: AuthenticatedAccount) {
    await this.auth.sendVerificationEmail(account.accountId);
    return { data: { sent: true } };
  }

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    await this.auth.verifyEmail(account.accountId, dto.code);
    return { data: { verified: true } };
  }

  /** No guard — this is how a locked-out (logged-out) person starts the
   * flow. Always reports success regardless of whether the email is
   * registered (see AuthService.requestPasswordReset's comment). */
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    return { data: { sent: true } };
  }

  /** No guard — the reset token from the emailed link is the only
   * credential here, not a session. */
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { data: { reset: true } };
  }
}
