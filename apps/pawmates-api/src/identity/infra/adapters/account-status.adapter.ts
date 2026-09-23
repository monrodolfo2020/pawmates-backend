import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AccountStatusPort } from '@pawmates/common';
import { Account } from '../../domain/entities/account.entity';

/** How long a status answer is reused before asking the database again.
 * Every authenticated request goes through the guard, and a screen
 * makes several at once; a short cache turns that burst into one query.
 * The cost is that a suspension can take up to this long to bite. */
const TTL_MS = 10_000;

/**
 * Tells JwtAuthGuard whether an account may still use the app.
 *
 * Deliberately a primary-key lookup of one column, since it runs on
 * every authenticated request.
 */
@Injectable()
export class AccountStatusAdapter implements AccountStatusPort {
  private readonly cache = new Map<string, { active: boolean; at: number }>();

  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  async isActive(accountId: string): Promise<boolean> {
    const hit = this.cache.get(accountId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.active;

    const row = await this.accounts.findOne({
      where: { id: accountId },
      select: { id: true, disabledAt: true },
    });
    // No row is a deleted account: its token must stop working as well.
    const active = row !== null && row.disabledAt === null;
    this.cache.set(accountId, { active, at: Date.now() });
    return active;
  }

  /** Called right after an admin suspends, re-enables or deletes an
   * account, so the change bites immediately on this instance instead of
   * after the cache expires. */
  forget(accountId: string): void {
    this.cache.delete(accountId);
  }
}
