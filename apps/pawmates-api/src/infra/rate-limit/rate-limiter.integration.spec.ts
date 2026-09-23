import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { TooManyRequestsError } from '@pawmates/common';
import { libsqlConnectionOptions } from '../persistence/libsql-connection';
import { CreateRateLimits1702700000000 } from '../persistence/migrations/1702700000000-CreateRateLimits';
import { RateLimiter } from './rate-limiter';
import type { RateLimitRule } from './rate-limit-rules';

/** Against a real libSQL file: the counting is one upsert with
 * RETURNING, which a mock can't vouch for. */
const TEST_DB_FILE = './rate-limiter.integration.test.db';
const rule: RateLimitRule = {
  name: 'test',
  max: 3,
  windowMs: 60_000,
  message: 'Espera {minutes}.',
};

describe('RateLimiter (integration)', () => {
  let db: DataSource;
  let limiter: RateLimiter;

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...libsqlConnectionOptions(),
      database: TEST_DB_FILE,
      entities: [],
    });
    await db.initialize();
    await new CreateRateLimits1702700000000().up(db.createQueryRunner());
    limiter = new RateLimiter(db);
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  it('allows up to the limit and refuses the next one, saying how long to wait', async () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) await limiter.consume(rule, 'a@x.com', t);
    await expect(limiter.consume(rule, 'a@x.com', t + 10_000)).rejects.toThrow(
      new TooManyRequestsError('Espera 1 minuto.'),
    );
  });

  it('starts counting again once the window has passed', async () => {
    const t = 5_000_000;
    for (let i = 0; i < 3; i++) await limiter.consume(rule, 'b@x.com', t);
    await expect(
      limiter.consume(rule, 'b@x.com', t + 60_001),
    ).resolves.toBeUndefined();
  });

  it('keeps subjects apart and ignores case', async () => {
    const t = 9_000_000;
    for (let i = 0; i < 3; i++) await limiter.record(rule, 'C@X.com', t);
    await expect(
      limiter.assertAllowed(rule, 'c@x.com', t),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
    await expect(
      limiter.assertAllowed(rule, 'd@x.com', t),
    ).resolves.toBeUndefined();
  });

  it('only failures count when used with assertAllowed + record, and clear resets', async () => {
    const t = 13_000_000;
    await limiter.record(rule, 'e@x.com', t);
    await limiter.record(rule, 'e@x.com', t);
    await limiter.clear(rule, 'e@x.com');
    await limiter.record(rule, 'e@x.com', t);
    await limiter.record(rule, 'e@x.com', t);
    await expect(
      limiter.assertAllowed(rule, 'e@x.com', t),
    ).resolves.toBeUndefined();
    await limiter.record(rule, 'e@x.com', t);
    await expect(
      limiter.assertAllowed(rule, 'e@x.com', t),
    ).rejects.toBeInstanceOf(TooManyRequestsError);
  });

  it('counts every one of several simultaneous attempts', async () => {
    const t = 17_000_000;
    await Promise.all(
      Array.from({ length: 10 }, () => limiter.record(rule, 'f@x.com', t)),
    );
    const rows: { count: number }[] = await db.query(
      `SELECT count FROM rate_limits WHERE key = 'test:f@x.com'`,
    );
    expect(Number(rows[0].count)).toBe(10);
  });

  it('tryConsume says no instead of throwing', async () => {
    const t = 21_000_000;
    const answers = [];
    for (let i = 0; i < 4; i++)
      answers.push(await limiter.tryConsume(rule, 'g', t));
    expect(answers).toEqual([true, true, true, false]);
  });
});
