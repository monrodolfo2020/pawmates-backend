import 'reflect-metadata';
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

/**
 * Integration test against a real local Postgres — the overlap detection
 * in NoDoubleBookingPolicy relies on a raw-SQL join over booking_lines
 * that a mocked QueryBuilder can't meaningfully exercise. Requires the
 * `booking` schema from CreateBookingSchema1700000000000 to already exist
 * (`npm run migration:run:booking-svc`); skips itself with a warning if
 * no database is reachable so `npm test` still passes in environments
 * without Postgres running (see task #8, docker-compose for CI).
 */
const PROVIDER_1 = '00000000-0000-0000-0000-000000000101';
const PROVIDER_2 = '00000000-0000-0000-0000-000000000102';

describe('NoDoubleBookingPolicy (integration)', () => {
  let dataSource: DataSource;
  let policy: NoDoubleBookingPolicy;
  let dbAvailable = true;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST ?? '127.0.0.1',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'pawmates',
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
      policy = new NoDoubleBookingPolicy(dataSource.getRepository(Booking));
    } catch (err) {
      dbAvailable = false;

      console.warn(
        `Skipping NoDoubleBookingPolicy integration tests — no reachable Postgres (${(err as Error).message})`,
      );
    }
  });

  afterAll(async () => {
    if (dbAvailable) await dataSource.destroy();
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await dataSource.query(
      'TRUNCATE booking.booking_lines, booking.bookings CASCADE',
    );
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
