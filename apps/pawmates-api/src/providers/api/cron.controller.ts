import { timingSafeEqual } from 'crypto';
import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { TrialRemindersService } from './trial-reminders.service';

/**
 * Jobs Vercel Cron calls on a schedule (see vercel.json's "crons").
 *
 * Vercel signs each call with `Authorization: Bearer <CRON_SECRET>`, the
 * secret set in the project's environment variables. Without that
 * variable these endpoints refuse to run at all, so nobody can trigger a
 * round of emails by guessing the URL.
 */
@Controller('v1/cron')
export class CronController {
  constructor(private readonly trialReminders: TrialRemindersService) {}

  @Get('trial-reminders')
  async trialRemindersJob(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret)
      throw new ServiceUnavailableException('CRON_SECRET no está configurado.');
    const expected = Buffer.from(`Bearer ${secret}`);
    const given = Buffer.from(authorization ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException();
    }
    return { data: await this.trialReminders.run() };
  }
}
