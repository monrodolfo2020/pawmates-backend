import {
  ClientIp,
  CurrentAccount,
  JwtAuthGuard,
  ValidationError,
} from '@pawmates/common';
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
import {
  ChangePasswordDto,
  ConfirmEmailChangeDto,
  RequestEmailChangeDto,
  UpdateMeDto,
} from './dto/update-me.dto';

@Controller('v1/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  /** Changes the name shown on the account (the Perfil screen). The email
   * changes through POST /v1/me/email and /email/confirm, below, since
   * the new address has to be proven first. */
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

  /** Asks to change the account's email: checks the password and sends
   * a code to the new address. Nothing changes until it's confirmed. */
  @Post('email')
  @HttpCode(200)
  async requestEmailChange(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() dto: RequestEmailChangeDto,
    @ClientIp() ip: string,
  ) {
    const found = await this.accounts.findOneOrFail({
      where: { id: account.accountId },
    });
    // Guessing the password here must be no easier than at Login, and
    // the codes sent count against the same email budget as any other.
    await this.limiter.assertAllowed(RATE_LIMITS.loginPerAccount, found.email);
    await this.limiter.consume(RATE_LIMITS.emailPerAddress, account.accountId);
    await this.limiter.consume(RATE_LIMITS.emailPerIp, ip);
    try {
      await this.auth.requestEmailChange(
        account.accountId,
        dto.password,
        dto.newEmail,
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        await this.limiter.record(RATE_LIMITS.loginPerAccount, found.email);
      }
      throw error;
    }
    return { data: { sent: true } };
  }

  /** The code from the new address: makes it the account's email. */
  @Post('email/confirm')
  @HttpCode(200)
  async confirmEmailChange(
    @CurrentAccount() account: AuthenticatedAccount,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    await this.limiter.assertAllowed(
      RATE_LIMITS.verifyCodePerAccount,
      account.accountId,
    );
    let email: string;
    try {
      email = await this.auth.confirmEmailChange(account.accountId, dto.code);
    } catch (error) {
      if (error instanceof ValidationError) {
        await this.limiter.record(
          RATE_LIMITS.verifyCodePerAccount,
          account.accountId,
        );
      }
      throw error;
    }
    await this.limiter.clear(
      RATE_LIMITS.verifyCodePerAccount,
      account.accountId,
    );
    return { data: { email, emailVerified: true } };
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
