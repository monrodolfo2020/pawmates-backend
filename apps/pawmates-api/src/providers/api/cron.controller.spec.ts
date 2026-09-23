import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { CronController } from './cron.controller';
import type { TrialRemindersService } from './trial-reminders.service';

describe('CronController', () => {
  const run = jest.fn().mockResolvedValue({ checked: 0, sent: 0, failed: [] });
  const controller = new CronController({
    run,
  } as unknown as TrialRemindersService);
  const original = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = original;
    run.mockClear();
  });

  it('refuses to run without CRON_SECRET configured', async () => {
    delete process.env.CRON_SECRET;
    await expect(
      controller.trialRemindersJob('Bearer cualquiera'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a call without the right secret', async () => {
    process.env.CRON_SECRET = 'secreto-largo';
    await expect(
      controller.trialRemindersJob(undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      controller.trialRemindersJob('Bearer otro-secreto'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs the job when Vercel calls with the secret', async () => {
    process.env.CRON_SECRET = 'secreto-largo';
    await expect(
      controller.trialRemindersJob('Bearer secreto-largo'),
    ).resolves.toEqual({
      data: { checked: 0, sent: 0, failed: [] },
    });
    expect(run).toHaveBeenCalledTimes(1);
  });
});
