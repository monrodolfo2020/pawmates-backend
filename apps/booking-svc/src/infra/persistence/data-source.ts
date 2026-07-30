import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { Booking } from '../../domain/entities/booking.entity';
import { BookingLine } from '../../domain/entities/booking-line.entity';
import { CancellationRecord } from '../../domain/entities/cancellation-record.entity';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { PriceBreakdown } from '../../domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from '../../domain/entities/recurrence-series.entity';
import { RescheduleRequest } from '../../domain/entities/reschedule-request.entity';

/**
 * Used only by the TypeORM CLI (`npm run migration:run:booking-svc`) and
 * by tests that spin up a real schema — the app itself gets its
 * connection via TypeOrmModule.forRootAsync in booking.module.ts.
 */
const bookingDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
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
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  migrationsTableName: 'migrations_booking',
});

export default bookingDataSource;
