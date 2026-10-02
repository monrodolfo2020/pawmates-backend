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
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import {
  isPageStatKind,
  statDay,
  statMonths,
  totalsByMonth,
} from '../domain/value-objects/page-stats';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { RATE_LIMITS } from '../../infra/rate-limit/rate-limit-rules';

/**
 * A business's page statistics (see page-stats.ts): the app reports a
 * visit or a tap, and the business reads its monthly totals in its panel.
 *
 * Seeing the full numbers is part of the paid plan (and of the trial),
 * which is checked here rather than in the app so a free page never even
 * receives them; a free page gets this month's visits as a preview.
 */
@Controller('v1/providers')
export class PageStatsController {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    private readonly limiter: RateLimiter,
  ) {}

  /** Public, like the page itself. Never fails loudly: a stat that can't
   * be counted must not get in the way of whoever is looking at the page. */
  @Post(':accountId/events')
  @HttpCode(204)
  async record(
    @ClientIp() ip: string,
    @Param('accountId') accountId: string,
    @Body() body: { kind?: unknown },
  ): Promise<void> {
    if (!isPageStatKind(body?.kind)) {
      throw new ValidationError('Ese tipo de evento no existe.');
    }
    const kind = body.kind;
    const exists = await this.profiles.exists({ where: { accountId } });
    if (!exists) return;
    const fresh = await this.limiter.tryConsume(
      RATE_LIMITS.pageEventPerVisitor,
      `${ip}|${accountId}|${kind}`,
    );
    if (!fresh) return;
    await this.db.query(
      `INSERT INTO providers_page_stats (provider_id, day, kind, count) VALUES (?, ?, ?, 1)
       ON CONFLICT(provider_id, day, kind) DO UPDATE SET count = count + 1`,
      [accountId, statDay(), kind],
    );
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  async mine(@CurrentAccount() account: AuthenticatedAccount) {
    const profile = await this.profiles.findOne({
      where: { accountId: account.accountId },
    });
    const months = statMonths();
    const rows: { day: string; kind: string; count: number }[] =
      await this.db.query(
        `SELECT day, kind, count FROM providers_page_stats
         WHERE provider_id = ? AND day >= ?`,
        [account.accountId, `${months.lastMonth}-01`],
      );
    const totals = totalsByMonth(rows, months);
    if (profile && (profile.isVip() || profile.inTrial())) {
      return { data: { unlocked: true, ...totals } };
    }
    return {
      data: {
        unlocked: false,
        thisMonth: { view: totals.thisMonth.view },
        lastMonth: null,
      },
    };
  }
}
