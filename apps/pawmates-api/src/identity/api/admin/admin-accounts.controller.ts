import {
  AdminGuard,
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../../domain/entities/account.entity';
import { AccountStatusAdapter } from '../../infra/adapters/account-status.adapter';
import { AccountDeletionService } from '../account-deletion.service';
import {
  DeleteAccountDto,
  UpdateAccountDto,
  UpdateAccountStatusDto,
} from '../dto/admin-account.dto';

function toAdminAccount(a: Account) {
  return {
    id: a.id,
    email: a.email,
    name: a.name,
    roles: a.roles,
    emailVerified: a.emailVerifiedAt !== null,
    disabledAt: a.disabledAt,
    createdAt: a.createdAt,
  };
}

/**
 * Admin panel, "Cuentas" tab: everyone registered, and correcting,
 * suspending or deleting an account. No signup path grants 'admin' (see
 * README) — the first admin account is promoted by hand in the database.
 */
@Controller('v1/admin/accounts')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminAccountsController {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    private readonly deletion: AccountDeletionService,
    private readonly accountStatus: AccountStatusAdapter,
  ) {}

  @Get()
  async list() {
    const rows = await this.accounts.find({ order: { createdAt: 'DESC' } });
    return { data: rows.map(toAdminAccount) };
  }

  /**
   * Corrects an account's name or email.
   *
   * Roles are deliberately not editable here. Granting 'admin' from a
   * panel is a privilege escalation waiting for a stolen session, and
   * the README's rule is that admins are promoted by hand; switching
   * someone between owner and provider has consequences (a business page,
   * a verification, a different agreement to accept) that a role toggle
   * would skip.
   *
   * A changed email is unverified again: the new address hasn't been
   * proven to belong to the person, and the old verification says
   * nothing about it.
   */
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAccountDto) {
    const target = await this.accounts.findOne({ where: { id } });
    if (!target) throw new ResourceNotFoundError('Esa cuenta no existe.');

    if (dto.name !== undefined) {
      target.name = dto.name.trim() || null;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email !== target.email) {
        const taken = await this.accounts.findOne({ where: { email } });
        if (taken) {
          throw new ValidationError('Ya existe otra cuenta con ese correo.');
        }
        target.email = email;
        target.emailVerifiedAt = null;
      }
    }
    await this.accounts.save(target);
    return { data: toAdminAccount(target) };
  }

  /**
   * Suspends or re-enables an account. A suspended account can't sign
   * in, loses access immediately even with a session already open (see
   * JwtAuthGuard), and — if it's a business — drops out of the directory
   * and its page stops answering. Nothing is deleted, so re-enabling
   * brings everything back as it was.
   */
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateAccountStatusDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (id === account.accountId) {
      throw new ValidationError('No puedes suspender tu propia cuenta.');
    }
    const target = await this.accounts.findOne({ where: { id } });
    if (!target) throw new ResourceNotFoundError('Esa cuenta no existe.');
    if (target.roles.includes('admin')) {
      throw new ValidationError(
        'Las cuentas de administrador no se suspenden desde el panel.',
      );
    }
    target.disabledAt = dto.enabled ? null : new Date();
    await this.accounts.save(target);
    // Otherwise the guard would keep answering from its cache for a few
    // seconds on this instance.
    this.accountStatus.forget(id);
    return { data: toAdminAccount(target) };
  }

  /** Permanently deletes an account — see AccountDeletionService for
   * what goes and what is kept, and why. */
  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Body() dto: DeleteAccountDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const summary = await this.deletion.delete({
      accountId: id,
      confirmEmail: dto.confirmEmail,
      requestedBy: account.accountId,
    });
    return { data: summary };
  }
}
