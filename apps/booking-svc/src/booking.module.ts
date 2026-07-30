import { IDEMPOTENCY_SERVICE_NAME } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingController } from './api/booking.controller';
import { Booking } from './domain/entities/booking.entity';
import { BookingLine } from './domain/entities/booking-line.entity';
import { CancellationRecord } from './domain/entities/cancellation-record.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { PriceBreakdown } from './domain/entities/price-breakdown.entity';
import { RecurrenceSeries } from './domain/entities/recurrence-series.entity';
import { RescheduleRequest } from './domain/entities/reschedule-request.entity';
import { NoDoubleBookingPolicy } from './domain/policies/no-double-booking.policy';
import { BookingProcessManager } from './domain/saga/booking-process-manager';
import { GrpcClientsModule } from './infra/grpc/grpc-clients.module';
import { GpsEventsConsumer } from './infra/messaging/gps-events.consumer';
import { OutboxRelayJob } from './infra/messaging/outbox-relay.job';
import { RedisProvider } from './infra/redis.provider';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
    }),
    TypeOrmModule.forRoot({
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
      synchronize: false, // schema owned by migrations (Data Model doc §14)
    }),
    TypeOrmModule.forFeature([
      Booking,
      BookingLine,
      CancellationRecord,
      PriceBreakdown,
      RecurrenceSeries,
      RescheduleRequest,
      OutboxEvent,
    ]),
    GrpcClientsModule,
  ],
  controllers: [BookingController],
  providers: [
    BookingProcessManager,
    NoDoubleBookingPolicy,
    OutboxRelayJob,
    GpsEventsConsumer,
    RedisProvider,
    { provide: IDEMPOTENCY_SERVICE_NAME, useValue: 'booking' },
  ],
})
export class BookingModule {}
