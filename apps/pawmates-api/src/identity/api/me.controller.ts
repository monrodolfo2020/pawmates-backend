import { CurrentAccount, JwtAuthGuard } from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  InternalServerErrorException,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import { AuthService } from './auth.service';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { RATE_LIMITS } from '../../infra/rate-limit/rate-limit-rules';
import { ChangePasswordDto, UpdateMeDto } from './dto/update-me.dto';

@Controller('v1/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Changes the name shown on the account (the Perfil screen). The email
   * isn't editable here: changing it needs a verification of the new
   * address, which an admin can do for now (AdminAccountsController). */
  @Patch()
  async update(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() dto: UpdateMeDto,
  ) {
    const found = await this.accounts.findOneOrFail({
      where: { id: account.accountId },
    });
    found.name = dto.name.trim();
    await this.accounts.save(found);
    return { data: { id: found.id, name: found.name } };
  }

  @Post('password')
  @HttpCode(200)
  async changePassword(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() dto: ChangePasswordDto,
  ) {
    // The same budget as wrong logins for this account: guessing the
    // current password here must not be an easier way in than Login.
    const found = await this.accounts.findOneOrFail({
      where: { id: account.accountId },
    });
    await this.limiter.assertAllowed(RATE_LIMITS.loginPerAccount, found.email);
    try {
      await this.auth.changePassword(
        account.accountId,
        dto.currentPassword,
        dto.newPassword,
      );
    } catch (error) {
      await this.limiter.record(RATE_LIMITS.loginPerAccount, found.email);
      throw error;
    }
    await this.limiter.clear(RATE_LIMITS.loginPerAccount, found.email);
    return { data: { changed: true } };
  }

  @Get()
  async me(@CurrentAccount() account: AuthenticatedAccount) {
    const found = await this.accounts.findOne({
      where: { id: account.accountId },
    });
    if (!found) {
      // JwtAuthGuard already validated the token's signature — a missing
      // row here means the account was deleted after the token was
      // issued, not a client error.
      throw new InternalServerErrorException('account.not_found');
    }
    return {
      data: {
        id: found.id,
        email: found.email,
        name: found.name,
        roles: found.roles,
        emailVerified: found.emailVerifiedAt !== null,
      },
    };
  }
}
