import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { ValidationError } from '@pawmates/common';
import pawmatesDataSource from '../../infra/persistence/data-source';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { PageStatsController } from './page-stats.controller';

/** Against the real schema: counting visits and taps once per visitor,
 * and who gets to see the full numbers. */
const TEST_DB_FILE = './page-stats.integration.test.db';
const me = (accountId: string) => ({
  accountId,
  roles: ['provider'],
  activeContext: 'provider' as const,
});

describe('PageStatsController (integration)', () => {
  let db: DataSource;
  let controller: PageStatsController;

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...pawmatesDataSource.options,
      database: TEST_DB_FILE,
    } as never);
    await db.initialize();
    await db.runMigrations();
    controller = new PageStatsController(
      db,
      db.getRepository(ProviderProfile),
      new RateLimiter(db),
    );
    const business = async (id: string, trialEndsAt: string | null) => {
      await db.query(
        `INSERT INTO providers_profiles (id, account_id, business_name, category, is_published, approved_at, trial_ends_at) VALUES (?, ?, ?, 'vet', 1, datetime('now'), ?)`,
        [`p-${id}`, id, `Negocio ${id}`, trialEndsAt],
      );
    };
    await business('trial', '2999-01-01 00:00:00');
    await business('free', '2020-01-01 00:00:00');
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  it('counts a visit and a WhatsApp tap once per visitor, and each visitor separately', async () => {
    await controller.record('1.1.1.1', 'trial', { kind: 'view' });
    await controller.record('1.1.1.1', 'trial', { kind: 'view' }); // reload
    await controller.record('2.2.2.2', 'trial', { kind: 'view' });
    await controller.record('1.1.1.1', 'trial', { kind: 'whatsapp' });
    const { data } = await controller.mine(me('trial'));
    expect(data.unlocked).toBe(true);
    expect(data.thisMonth).toEqual({ view: 2, whatsapp: 1, directions: 0 });
    expect(data.lastMonth).toEqual({ view: 0, whatsapp: 0, directions: 0 });
  });

  it('gives a free page only this month’s visits', async () => {
    await controller.record('3.3.3.3', 'free', { kind: 'view' });
    await controller.record('3.3.3.3', 'free', { kind: 'directions' });
    const { data } = await controller.mine(me('free'));
    expect(data).toEqual({
      unlocked: false,
      thisMonth: { view: 1 },
      lastMonth: null,
    });
  });

  it('ignores businesses that do not exist and refuses unknown kinds', async () => {
    await controller.record('4.4.4.4', 'nobody', { kind: 'view' });
    const rows: { n: number }[] = await db.query(
      `SELECT COUNT(*) AS n FROM providers_page_stats WHERE provider_id = 'nobody'`,
    );
    expect(Number(rows[0].n)).toBe(0);
    await expect(
      controller.record('4.4.4.4', 'trial', { kind: 'hack' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
