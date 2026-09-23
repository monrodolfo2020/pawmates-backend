import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import pawmatesDataSource from '../../infra/persistence/data-source';
import { Account } from '../../identity/domain/entities/account.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { TrialRemindersService } from './trial-reminders.service';

/** Against the real schema, so the query and the columns it reads are
 * checked too — not just the rule in trialNoticeDue. */
const TEST_DB_FILE = './trial-reminders.integration.test.db';
const NOW = new Date('2026-04-01T15:00:00Z');
const days = (d: number) =>
  new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000).toISOString();

describe('TrialRemindersService (integration)', () => {
  let db: DataSource;
  let service: TrialRemindersService;
  const stage = async (id: string): Promise<string | null> => {
    const rows: { s: string | null }[] = await db.query(
      `SELECT trial_notice_stage AS s FROM providers_profiles WHERE account_id = ?`,
      [id],
    );
    return rows[0].s;
  };

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...pawmatesDataSource.options,
      database: TEST_DB_FILE,
    } as never);
    await db.initialize();
    await db.runMigrations();
    service = new TrialRemindersService(
      db.getRepository(ProviderProfile),
      db.getRepository(Account),
    );

    const business = async (
      id: string,
      trialEnds: string | null,
      extra = '',
    ) => {
      await db.query(
        `INSERT INTO identity_accounts (id, email, password_hash, roles${extra ? ', disabled_at' : ''}) VALUES (?, ?, 'x', '["provider"]'${extra ? ", datetime('now')" : ''})`,
        [id, `${id}@t.app`],
      );
      await db.query(
        `INSERT INTO providers_profiles (id, account_id, business_name, approved_at, trial_ends_at) VALUES (?, ?, ?, datetime('now'), ?)`,
        [`p-${id}`, id, `Negocio ${id}`, trialEnds],
      );
    };
    await business('week', days(6));
    await business('tomorrow', days(0.5));
    await business('over', days(-1));
    await business('later', days(20));
    await business('none', null);
    await business('suspended', days(3), 'disabled');
    await business('vip', days(-3));
    await db.query(
      `UPDATE providers_profiles SET plan = 'vip' WHERE account_id = 'vip'`,
    );
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  it('sends each business the email that is due, once, and remembers it', async () => {
    const send = jest
      .fn<
        Promise<{ sent: true }>,
        [string, { subject: string; html: string }]
      >()
      .mockResolvedValue({ sent: true });
    const summary = await service.run(NOW, send);

    const to = send.mock.calls.map(([email, content]) => [
      email,
      content.subject,
    ]);
    expect(to).toEqual(
      expect.arrayContaining([
        ['week@t.app', 'Te quedan 7 días de prueba gratis en PawMates'],
        ['tomorrow@t.app', 'Mañana termina tu prueba gratis en PawMates'],
        ['over@t.app', 'Terminó tu prueba gratis: tu diseño está guardado'],
      ]),
    );
    expect(send).toHaveBeenCalledTimes(3);
    expect(summary.sent).toBe(3);
    expect(await stage('week')).toBe('7d');
    expect(await stage('over')).toBe('ended');
    expect(await stage('later')).toBeNull();
    expect(await stage('suspended')).toBeNull();
    // Already paying: nothing to send, closed out so it stops coming back.
    expect(await stage('vip')).toBe('ended');

    // The next day nobody gets the same email again.
    send.mockClear();
    await service.run(new Date(NOW.getTime() + 60 * 60 * 1000), send);
    expect(send).not.toHaveBeenCalled();
  });

  it('tries again the next day when an email could not be sent', async () => {
    await db.query(
      `UPDATE providers_profiles SET trial_notice_stage = '7d' WHERE account_id = 'later'`,
    );
    await db.query(
      `UPDATE providers_profiles SET trial_ends_at = ? WHERE account_id = 'later'`,
      [days(0.3)],
    );
    const fail = jest
      .fn()
      .mockResolvedValue({ sent: false, reason: 'Sin configurar' });
    const summary = await service.run(NOW, fail);
    expect(summary.failed).toEqual([
      { accountId: 'later', reason: 'Sin configurar' },
    ]);
    expect(await stage('later')).toBe('7d');

    const ok = jest.fn().mockResolvedValue({ sent: true });
    await service.run(NOW, ok);
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await stage('later')).toBe('1d');
  });
});
