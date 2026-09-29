import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import {
  BookingNotEligibleForReviewError,
  RoleRequiredError,
} from '@pawmates/common';
import pawmatesDataSource from '../../infra/persistence/data-source';
import { Account } from '../../identity/domain/entities/account.entity';
import { Booking } from '../../booking/domain/entities/booking.entity';
import { ProviderProfile } from '../domain/entities/provider-profile.entity';
import { Review } from '../domain/entities/review.entity';
import { ReviewsController, shortName } from './reviews.controller';
import { loadRatings } from './ratings';

/** Against the real schema: who may review what, editing instead of
 * duplicating, and the averages the directory ranks by. */
const TEST_DB_FILE = './reviews.integration.test.db';
const owner = (accountId: string) => ({
  accountId,
  roles: ['owner'],
  activeContext: 'owner' as const,
});

describe('ReviewsController (integration)', () => {
  let db: DataSource;
  let controller: ReviewsController;

  beforeAll(async () => {
    fs.rmSync(TEST_DB_FILE, { force: true });
    db = new DataSource({
      ...pawmatesDataSource.options,
      database: TEST_DB_FILE,
    } as never);
    await db.initialize();
    await db.runMigrations();
    controller = new ReviewsController(
      db.getRepository(Review),
      db.getRepository(ProviderProfile),
      db.getRepository(Account),
      db.getRepository(Booking),
    );

    const account = async (
      id: string,
      roles: string,
      name: string,
      verified = true,
    ) =>
      db.query(
        `INSERT INTO identity_accounts (id, email, password_hash, roles, name, email_verified_at) VALUES (?, ?, 'x', ?, ?, ${verified ? "datetime('now')" : 'NULL'})`,
        [id, `${id}@t.app`, roles, name],
      );
    const business = async (id: string, category: string) => {
      await account(id, '["provider"]', `Negocio ${id}`);
      await db.query(
        `INSERT INTO providers_profiles (id, account_id, business_name, category, is_published, approved_at) VALUES (?, ?, ?, ?, 1, datetime('now'))`,
        [`p-${id}`, id, `Negocio ${id}`, category],
      );
    };
    const booking = async (
      id: string,
      ownerId: string,
      providerId: string,
      status: string,
      when: string,
    ) =>
      db.query(
        `INSERT INTO booking_bookings (id, owner_id, provider_id, status, scheduled_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, ownerId, providerId, status, when, id],
      );

    await account('ana', '["owner"]', 'Ana García López');
    await account('beto', '["owner"]', 'Beto');
    await account('unverified', '["owner"]', 'Carla', false);
    await business('walker', 'walker');
    await business('vet', 'vet');
    await booking('past', 'ana', 'walker', 'confirmed', '2026-01-01 10:00:00');
    await booking(
      'future',
      'ana',
      'walker',
      'confirmed',
      '2999-01-01 10:00:00',
    );
    await booking('asked', 'ana', 'walker', 'requested', '2026-01-01 10:00:00');
    await booking(
      'betos',
      'beto',
      'walker',
      'completed',
      '2026-01-02 10:00:00',
    );
  });

  afterAll(async () => {
    await db.destroy();
    fs.rmSync(TEST_DB_FILE, { force: true });
  });

  it('lets an owner rate a walker only for a booking of theirs that already took place', async () => {
    const write = (bookingId?: string) =>
      controller.write('walker', { rating: 5, bookingId }, owner('ana'));
    await expect(write()).rejects.toBeInstanceOf(
      BookingNotEligibleForReviewError,
    );
    await expect(write('future')).rejects.toBeInstanceOf(
      BookingNotEligibleForReviewError,
    );
    await expect(write('asked')).rejects.toBeInstanceOf(
      BookingNotEligibleForReviewError,
    );
    await expect(write('betos')).rejects.toBeInstanceOf(
      BookingNotEligibleForReviewError,
    );

    const { data } = await write('past');
    expect(data).toMatchObject({ bookingId: 'past', rating: 5 });
  });

  it('edits the review for the same booking instead of adding another', async () => {
    await controller.write(
      'walker',
      { rating: 3, comment: '  Llegó tarde  ', bookingId: 'past' },
      owner('ana'),
    );
    const { data, meta } = await controller.list('walker');
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      rating: 3,
      comment: 'Llegó tarde',
      authorName: 'Ana G.',
    });
    expect(meta.rating).toEqual({ average: 3, count: 1 });
  });

  it('lets any owner with a verified email review a business that is not booked in the app, once', async () => {
    await controller.write('vet', { rating: 4 }, owner('ana'));
    await controller.write(
      'vet',
      { rating: 5, comment: 'Muy amables' },
      owner('ana'),
    );
    await controller.write('vet', { rating: 2 }, owner('beto'));
    await expect(
      controller.write('vet', { rating: 5 }, owner('unverified')),
    ).rejects.toBeInstanceOf(BookingNotEligibleForReviewError);

    const { data, meta } = await controller.list('vet');
    expect(data.map((r) => r.rating).sort()).toEqual([2, 5]);
    expect(meta.rating).toEqual({ average: 3.5, count: 2 });
  });

  it('refuses a business reviewing, and an owner reviewing their own business', async () => {
    await expect(
      controller.write(
        'vet',
        { rating: 5 },
        { accountId: 'walker', roles: ['provider'], activeContext: 'provider' },
      ),
    ).rejects.toBeInstanceOf(RoleRequiredError);
    await expect(
      controller.write(
        'vet',
        { rating: 5 },
        {
          accountId: 'vet',
          roles: ['owner', 'provider'],
          activeContext: 'owner',
        },
      ),
    ).rejects.toThrow('propio negocio');
  });

  it('lists what an owner has written, and averages per business', async () => {
    const { data } = await controller.mine(owner('ana'));
    expect(data.map((r) => r.providerId).sort()).toEqual(['vet', 'walker']);
    const ratings = await loadRatings(db.getRepository(Review), [
      'vet',
      'walker',
      'nobody',
    ]);
    expect(ratings.get('vet')).toEqual({ average: 3.5, count: 2 });
    expect(ratings.get('walker')).toEqual({ average: 3, count: 1 });
    expect(ratings.has('nobody')).toBe(false);
  });

  it('shortens names so a customer is not published in full', () => {
    expect(shortName('Ana García López')).toBe('Ana G.');
    expect(shortName('Beto')).toBe('Beto');
    expect(shortName(null)).toBe('Dueño de PET Conect@');
  });
});
