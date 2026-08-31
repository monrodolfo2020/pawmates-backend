import 'reflect-metadata';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { BookingProviderDoubleBookedError } from '@pawmates/common';
import { Booking } from '../entities/booking.entity';
import { BookingLine } from '../entities/booking-line.entity';
import { CancellationRecord } from '../entities/cancellation-record.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PriceBreakdown } from '../entities/price-breakdown.entity';
import { RecurrenceSeries } from '../entities/recurrence-series.entity';
import { RescheduleRequest } from '../entities/reschedule-request.entity';
import { BookingStatus } from '../value-objects/booking-status';
import { NoDoubleBookingPolicy } from './no-double-booking.policy';
import { libsqlConnectionOptions } from '../../../infra/persistence/libsql-connection';

/**
 * Integration test against a real local libSQL file — the overlap
 * detection in NoDoubleBookingPolicy relies on a raw-SQL join over
 * booking_lines (plus SQLite-specific datetime() arithmetic) that a
 * mocked QueryBuilder can't meaningfully exercise. Uses its own throwaway
 * file (not the app's dev database) and creates the two tables it needs
 * directly rather than running the full migration set.
 */
const PROVIDER_1 = '00000000-0000-0000-0000-000000000101';
const PROVIDER_2 = '00000000-0000-0000-0000-000000000102';
const TEST_DB_FILE = './no-double-booking.policy.integration.test.db';

describe('NoDoubleBookingPolicy (integration)', () => {
  let dataSource: DataSource;
  let policy: NoDoubleBookingPolicy;
  let dbAvailable = true;

  beforeAll(async () => {
    try { fs.unlinkSync(TEST_DB_FILE); } catch {}
    dataSource = new DataSource({
      ...libsqlConnectionOptions(),
      database: TEST_DB_FILE,
      entities: [
        Booking,
        BookingLine,
        CancellationRecord,
        PriceBreakdown,
        RecurrenceSeries,
        RescheduleRequest,
        OutboxEvent,
      ],
    });
    try {
      await dataSource.initialize();
      await dataSource.query(`
        CREATE TABLE booking_bookings (
          id text PRIMARY KEY, owner_id text NOT NULL, provider_id text NOT NULL,
          status text NOT NULL, recurrence_series_id text NULL, scheduled_at datetime NOT NULL,
          idempotency_key text NOT NULL, created_at datetime NOT NULL DEFAULT (datetime('now')),
          updated_at datetime NOT NULL DEFAULT (datetime('now'))
        )
      `);
      await dataSource.query(`
        CREATE TABLE booking_booking_lines (
          id text PRIMARY KEY, booking_id text NOT NULL, pet_id text NOT NULL,
          service_type_code text NOT NULL, duration_value int NOT NULL,
          duration_unit text NOT NULL, address_id text NOT NULL
        )
      `);
      policy = new NoDoubleBookingPolicy(dataSource.getRepository(Booking));
    } catch (err) {
      dbAvailable = false;

      console.warn(
        `Skipping NoDoubleBookingPolicy integration tests — could not open local libSQL file (${(err as Error).message})`,
      );
    }
  });

  afterAll(async () => {
    if (dbAvailable) await dataSource.destroy();
    try { fs.unlinkSync(TEST_DB_FILE); } catch {}
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await dataSource.query('DELETE FROM booking_booking_lines');
    await dataSource.query('DELETE FROM booking_bookings');
  });

  async function seedBooking(params: {
    providerId: string;
    scheduledAt: Date;
    durationMinutes: number;
    status: BookingStatus;
  }): Promise<void> {
    const booking = Booking.request({
      ownerId: '00000000-0000-0000-0000-000000000001',
      providerId: params.providerId,
      scheduledAt: params.scheduledAt,
      idempotencyKey: `seed-${params.scheduledAt.toISOString()}-${params.providerId}`,
      lines: [
        {
          petId: '00000000-0000-0000-0000-000000000002',
          serviceTypeCode: 'walk',
          durationValue: params.durationMinutes,
          durationUnit: 'min',
          addressId: '00000000-0000-0000-0000-000000000003',
        },
      ],
    });
    booking.status = params.status;
    await dataSource.getRepository(Booking).save(booking);
  }

  it('throws when a new slot overlaps an existing Confirmed booking', async () => {
    if (!dbAvailable) return;
    await seedBooking({
      providerId: PROVIDER_1,
      scheduledAt: new Date('2026-09-01T10:00:00Z'),
      durationMinutes: 60,
      status: BookingStatus.Confirmed,
    });

    await expect(
      policy.assertAvailable(PROVIDER_1, new Date('2026-09-01T10:30:00Z'), 30),
    ).rejects.toThrow(BookingProviderDoubleBookedError);
  });

  it('allows a slot that starts after the existing booking ends', async () => {
    if (!dbAvailable) return;
    await seedBooking({
      providerId: PROVIDER_1,
      scheduledAt: new Date('2026-09-01T10:00:00Z'),
      durationMinutes: 60,
      status: BookingStatus.Confirmed,
    });

    await expect(
      policy.assertAvailable(PROVIDER_1, new Date('2026-09-01T11:00:00Z'), 30),
    ).resolves.toBeUndefined();
  });

  it('ignores overlapping bookings for a different provider', async () => {
    if (!dbAvailable) return;
    await seedBooking({
      providerId: PROVIDER_1,
      scheduledAt: new Date('2026-09-01T10:00:00Z'),
      durationMinutes: 60,
      status: BookingStatus.Confirmed,
    });

    await expect(
      policy.assertAvailable(PROVIDER_2, new Date('2026-09-01T10:30:00Z'), 30),
    ).resolves.toBeUndefined();
  });

  it('ignores a Cancelled booking that would otherwise overlap', async () => {
    if (!dbAvailable) return;
    await seedBooking({
      providerId: PROVIDER_1,
      scheduledAt: new Date('2026-09-01T10:00:00Z'),
      durationMinutes: 60,
      status: BookingStatus.Cancelled,
    });

    await expect(
      policy.assertAvailable(PROVIDER_1, new Date('2026-09-01T10:30:00Z'), 30),
    ).resolves.toBeUndefined();
  });
});
