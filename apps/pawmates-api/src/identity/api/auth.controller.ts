import {
  CurrentAccount,
  JwtAuthGuard,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AddRoleDto } from './dto/add-role.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

/**
 * Real email+password auth, replacing this MVP's original dev-login
 * shortcut. No email verification, no password reset — signup/login only
 * (see README's Identity section for what's still out of scope).
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
}
