import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AccountStanding, AccountStatusPort } from '@pawmates/common';
import { Account } from '../../domain/entities/account.entity';

/** How long a status answer is reused before asking the database again.
 * Every authenticated request goes through the guard, and a screen
 * makes several at once; a short cache turns that burst into one query.
 * The cost is that a suspension can take up to this long to bite. */
const TTL_MS = 10_000;

/**
 * Tells JwtAuthGuard whether an account may still use the app.
 *
 * Deliberately a primary-key lookup of two columns, since it runs on
 * every authenticated request.
 */
@Injectable()
export class AccountStatusAdapter implements AccountStatusPort {
  private readonly cache = new Map<string, { standing: AccountStanding; at: number }>();

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  async standing(accountId: string): Promise<AccountStanding> {
    const hit = this.cache.get(accountId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.standing;

    const row = await this.accounts.findOne({
      where: { id: accountId },
      select: { id: true, disabledAt: true, roles: true },
    });
    // No row is a deleted account: its token must stop working as well.
    const standing: AccountStanding =
      row === null
        ? { active: false, roles: [] }
        : { active: row.disabledAt === null, roles: row.roles ?? [] };
    this.cache.set(accountId, { standing, at: Date.now() });
    return standing;
  }

  /** Called right after an account is suspended, re-enabled, deleted or
   * given a new role, so the change bites immediately on this instance instead of
   * after the cache expires. */
  forget(accountId: string): void {
    this.cache.delete(accountId);
  }
}
