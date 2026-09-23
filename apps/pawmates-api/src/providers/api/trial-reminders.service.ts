import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Not, Or, Repository } from 'typeorm';
import { sendTrialEmail, trialEmailContent } from '@pawmates/common';
import type { EmailResult } from '@pawmates/common';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { vipPrice } from '../domain/value-objects/billing';

const APP_URL = process.env.APP_URL ?? 'https://pawmates-one.vercel.app';

/** How many businesses one run handles — the function has 30 seconds.
 * Whoever doesn't fit is picked up by the next day's run. */
const BATCH = 60;

export type TrialReminderSummary = {
  checked: number;
  sent: number;
  failed: { accountId: string; reason: string }[];
};

const money = (cents: number, currency: string) =>
  `$${(cents / 100).toLocaleString('es-MX')} ${currency}`;

/**
 * Sends the free-trial emails that are due (see
 * ProviderProfile.trialNoticeDue). Run once a day by Vercel Cron through
 * CronController.
 *
 * A notice is recorded only once its email actually went out, so one
 * that failed — Resend down, sending not configured yet — is simply
 * tried again the next day.
 */
@Injectable()
export class TrialRemindersService {
  constructor(
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  async run(
    now: Date = new Date(),
    send: (
      to: string,
      content: { subject: string; html: string },
    ) => Promise<EmailResult> = sendTrialEmail,
  ): Promise<TrialReminderSummary> {
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const candidates = await this.profiles.find({
      where: {
        trialEndsAt: LessThanOrEqual(weekAhead),
        trialNoticeStage: Or(IsNull(), Not('ended')),
      },
      order: { trialEndsAt: 'ASC' },
      take: BATCH,
    });
    // Trial over and on VIP: no email will ever be due. Close them out so
    // they stop taking places in the batch day after day.
    const settled = candidates.filter(
      (p) => p.isVip(now) && p.trialEndsAt! <= now,
    );
    if (settled.length) {
      await this.profiles.update(
        { id: In(settled.map((p) => p.id)) },
        { trialNoticeStage: 'ended' },
      );
    }

    const due = candidates
      .map((profile) => ({ profile, notice: profile.trialNoticeDue(now) }))
      .filter((x) => x.notice !== null);

    const accounts = due.length
      ? await this.accounts.find({
          where: { id: In(due.map((x) => x.profile.accountId)) },
        })
      : [];
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const monthly = vipPrice('monthly');
    const annual = vipPrice('annual');

    const summary: TrialReminderSummary = {
      checked: candidates.length,
      sent: 0,
      failed: [],
    };
    for (const { profile, notice } of due) {
      const account = accountById.get(profile.accountId);
      // A suspended or deleted account gets nothing.
      if (!account || account.disabledAt) continue;
      const content = trialEmailContent({
        stage: notice!,
        businessName: profile.businessName ?? account.name ?? 'tu negocio',
        trialEndsAt: profile.trialEndsAt!,
        appUrl: APP_URL,
        monthlyPrice: money(monthly.amount, monthly.currency),
        annualPrice: money(annual.amount, annual.currency),
      });
      const result = await send(account.email, content);
      if (result.sent) {
        profile.trialNoticeStage = notice;
        await this.profiles.update(
          { id: profile.id },
          { trialNoticeStage: notice },
        );
        summary.sent += 1;
      } else {
        summary.failed.push({
          accountId: profile.accountId,
          reason: result.reason,
        });
      }
    }
    return summary;
  }
}
