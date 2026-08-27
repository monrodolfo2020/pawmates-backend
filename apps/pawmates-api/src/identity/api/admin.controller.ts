import {
  CurrentAccount,
  JwtAuthGuard,
  RoleRequiredError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';

function assertAdmin(account: AuthenticatedAccount): void {
  if (!account.roles.includes('admin')) {
    throw new RoleRequiredError(
      'Esta acción requiere el rol de administrador.',
    );
  }
}

/**
 * Minimal admin surface: see who's registered and review pending provider
 * verifications. No signup path grants 'admin' (see README) — the first
 * admin account is promoted by hand, directly in Postgres.
 */
@Controller('v1/admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
  ) {}

  @Get('accounts')
  async listAccounts(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.accounts.find({ order: { createdAt: 'DESC' } });
    return {
      data: rows.map((a) => ({
        id: a.id,
        email: a.email,
        name: a.name,
        roles: a.roles,
        createdAt: a.createdAt,
      })),
    };
  }

  @Get('provider-verifications')
  async listVerifications(@CurrentAccount() account: AuthenticatedAccount) {
    assertAdmin(account);
    const rows = await this.verifications.find({
      order: { createdAt: 'DESC' },
    });
    return {
      data: rows.map((v) => ({
        id: v.id,
        accountId: v.accountId,
        status: v.status,
        facePhoto: v.facePhotoBase64,
        idDocumentPhoto: v.idDocumentPhotoBase64,
        createdAt: v.createdAt,
      })),
    };
  }
}
