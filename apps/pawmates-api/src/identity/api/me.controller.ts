import { CurrentAccount, JwtAuthGuard } from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Controller,
  Get,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';

@Controller('v1/me')
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

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
      },
    };
  }
}
