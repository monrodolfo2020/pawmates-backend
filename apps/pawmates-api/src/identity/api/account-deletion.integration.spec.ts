import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { ValidationError } from '@pawmates/common';
import pawmatesDataSource from '../../infra/persistence/data-source';
import { RateLimiter } from '../../infra/rate-limit/rate-limiter';
import { RATE_LIMITS } from '../../infra/rate-limit/rate-limit-rules';
import type { AccountStatusAdapter } from '../infra/adapters/account-status.adapter';
import {
  AccountDeletionService,
  TABLES_ON_ACCOUNT_DELETION,
} from './account-deletion.service';

/**
 * Against the real schema: every migration runs on a throwaway file, so
 * a renamed table or column fails here instead of the first time an
 * admin deletes someone.
 */
const TEST_DB_FILE = './account-deletion.integration.test.db';

const WALKER = 'walker-1';
const OWNER = 'owner-1';
const ADMIN = 'admin-1';

describe('AccountDeletionService (integration)', () => {
  let db: DataSource;
  let service: AccountDeletionService;
  let limiter: RateLimiter;
  const forget = jest.fn();

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...pawmatesDataSource.options,
      database: TEST_DB_FILE,
    } as never);
    await db.initialize();
    await db.runMigrations();
    limiter = new RateLimiter(db);
    service = new AccountDeletionService(
      db,
      { forget } as unknown as AccountStatusAdapter,
      limiter,
    );

    const run = (sql: string, params: unknown[] = []) => db.query(sql, params);
    const account = (id: string, email: string, roles: string[]) =>
      run(
        `INSERT INTO identity_accounts (id, email, password_hash, roles) VALUES (?, ?, 'x', ?)`,
        [id, email, JSON.stringify(roles)],
      );
    await account(WALKER, 'pedro@t.app', ['provider']);
    await account(OWNER, 'ana@t.app', ['owner']);
    await account(ADMIN, 'adm@t.app', ['owner', 'admin']);

    // Pedro's own things.
    await run(
      `INSERT INTO identity_pets (id, owner_id, name, breed, size) VALUES ('pet-w', ?, 'Rex', 'Mestizo', 'Grande')`,
      [WALKER],
    );
    await run(
      `INSERT INTO identity_provider_verifications (id, account_id) VALUES ('ver-1', ?)`,
      [WALKER],
    );
    await run(
      `INSERT INTO identity_email_verification_codes (id, account_id, code, expires_at) VALUES ('code-1', ?, '123456', datetime('now'))`,
      [WALKER],
    );
    await run(
      `INSERT INTO identity_password_reset_tokens (id, account_id, token, expires_at) VALUES ('tok-1', ?, 'abc', datetime('now'))`,
      [WALKER],
    );
    await run(
      `INSERT INTO providers_profiles (account_id, photo_base64, photos, design_draft) VALUES (?, 'data:a', ?, ?)`,
      [
        WALKER,
        JSON.stringify(['data:a', 'data:b']),
        JSON.stringify({ logo: 'data:logo', cover: null }),
      ],
    );
    await run(
      `INSERT INTO identity_legal_acceptances (id, account_id, document_type, document_version) VALUES ('acc-1', ?, 'provider_agreement', '1.0')`,
      [WALKER],
    );
    await run(
      `INSERT INTO providers_plan_activations (id, account_id, period, source) VALUES ('act-1', ?, 'monthly', 'code')`,
      [WALKER],
    );

    // A walk Pedro did for Ana: shared, except Pedro's GPS trail.
    await run(
      `INSERT INTO identity_pets (id, owner_id, name, breed, size) VALUES ('pet-o', ?, 'Toby', 'Beagle', 'Mediano')`,
      [OWNER],
    );
    await run(
      `INSERT INTO booking_bookings (id, owner_id, provider_id, status, scheduled_at, idempotency_key) VALUES ('bk-1', ?, ?, 'completed', datetime('now'), 'k1')`,
      [OWNER, WALKER],
    );
    await run(
      `INSERT INTO booking_trip_locations (id, booking_id, lat, lng, recorded_at) VALUES ('loc-1', 'bk-1', 19.2, -99.6, datetime('now'))`,
    );
    await run(
      `INSERT INTO booking_messages (id, booking_id, sender_id, sender_role, text, sent_at) VALUES ('msg-1', 'bk-1', ?, 'provider', 'Llego a las 5', datetime('now'))`,
      [WALKER],
    );

    await limiter.record(RATE_LIMITS.loginPerAccount, 'pedro@t.app');
    await limiter.record(RATE_LIMITS.emailPerAddress, WALKER);
    await limiter.record(RATE_LIMITS.loginPerAccount, 'ana@t.app');
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result: T[] = await db.query(sql, params);
    return result;
  }
  const count = async (sql: string, params: unknown[] = []) =>
    Number((await rows<{ n: number }>(sql, params))[0].n);

  it('has decided, for every table in the schema, what a deletion does to it', async () => {
    const tables = (
      await rows<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
    ).map((t) => t.name);
    // A table missing here holds data nobody decided about: add it to
    // TABLES_ON_ACCOUNT_DELETION — and delete from it if it's personal.
    expect(
      tables.filter((t) => !(t in TABLES_ON_ACCOUNT_DELETION)).sort(),
    ).toEqual([]);
    // And the list doesn't describe tables that no longer exist.
    expect(
      Object.keys(TABLES_ON_ACCOUNT_DELETION).filter(
        (t) => !tables.includes(t),
      ),
    ).toEqual([]);
  });

  it('refuses without the matching email, and never deletes an admin', async () => {
    await expect(
      service.delete({
        accountId: WALKER,
        confirmEmail: 'otro@t.app',
        requestedBy: ADMIN,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.delete({
        accountId: ADMIN,
        confirmEmail: 'adm@t.app',
        requestedBy: OWNER,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await count(`SELECT count(*) n FROM identity_accounts`)).toBe(3);
  });

  it("deletes what was theirs alone and keeps what isn't", async () => {
    const summary = await service.delete({
      accountId: WALKER,
      confirmEmail: 'PEDRO@t.app',
      requestedBy: ADMIN,
    });
    // data:a (profile + gallery, once), data:b, data:logo.
    expect(summary).toEqual({
      accountId: WALKER,
      email: 'pedro@t.app',
      photosDeleted: 3,
    });

    const gone = [
      [`SELECT count(*) n FROM identity_accounts WHERE id = ?`, WALKER],
      [`SELECT count(*) n FROM identity_pets WHERE owner_id = ?`, WALKER],
      [
        `SELECT count(*) n FROM identity_provider_verifications WHERE account_id = ?`,
        WALKER,
      ],
      [
        `SELECT count(*) n FROM identity_email_verification_codes WHERE account_id = ?`,
        WALKER,
      ],
      [
        `SELECT count(*) n FROM identity_password_reset_tokens WHERE account_id = ?`,
        WALKER,
      ],
      [
        `SELECT count(*) n FROM providers_profiles WHERE account_id = ?`,
        WALKER,
      ],
      [
        `SELECT count(*) n FROM booking_trip_locations WHERE booking_id = 'bk-1'`,
      ],
      [
        `SELECT count(*) n FROM rate_limits WHERE key IN ('login-account:pedro@t.app', 'email-address:${WALKER}')`,
      ],
    ] as const;
    for (const [sql, param] of gone) {
      expect({ sql, n: await count(sql, param ? [param] : []) }).toEqual({
        sql,
        n: 0,
      });
    }

    const kept = [
      `SELECT count(*) n FROM booking_bookings WHERE id = 'bk-1'`,
      `SELECT count(*) n FROM booking_messages WHERE id = 'msg-1'`,
      `SELECT count(*) n FROM identity_legal_acceptances WHERE id = 'acc-1'`,
      `SELECT count(*) n FROM providers_plan_activations WHERE id = 'act-1'`,
      // Ana is untouched: her account, her pet, her counters.
      `SELECT count(*) n FROM identity_accounts WHERE id = '${OWNER}'`,
      `SELECT count(*) n FROM identity_pets WHERE id = 'pet-o'`,
      `SELECT count(*) n FROM rate_limits WHERE key = 'login-account:ana@t.app'`,
    ];
    for (const sql of kept) {
      expect({ sql, n: await count(sql) }).toEqual({ sql, n: 1 });
    }
    expect(forget).toHaveBeenCalledWith(WALKER);
  });
});
