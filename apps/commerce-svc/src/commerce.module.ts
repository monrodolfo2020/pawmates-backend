import { IDEMPOTENCY_SERVICE_NAME } from '@pawmates/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderController } from './api/order.controller';
import { ProductController } from './api/product.controller';
import { StorefrontController } from './api/storefront.controller';
import { OrderLineItem } from './domain/entities/order-line-item.entity';
import { Order } from './domain/entities/order.entity';
import { OutboxEvent } from './domain/entities/outbox-event.entity';
import { Product } from './domain/entities/product.entity';
import { Storefront } from './domain/entities/storefront.entity';
import { RequiresUpcomingBookingPolicy } from './domain/policies/requires-upcoming-booking.policy';
import { CommerceProcessManager } from './domain/saga/commerce-process-manager';
import { GrpcClientsModule } from './infra/grpc/grpc-clients.module';
import { BookingEventsConsumer } from './infra/messaging/booking-events.consumer';
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
      entities: [Storefront, Product, Order, OrderLineItem, OutboxEvent],
      synchronize: false, // schema owned by migrations
    }),
    TypeOrmModule.forFeature([
      Storefront,
      Product,
      Order,
      OrderLineItem,
      OutboxEvent,
    ]),
    GrpcClientsModule,
  ],
  controllers: [StorefrontController, ProductController, OrderController],
  providers: [
    CommerceProcessManager,
    RequiresUpcomingBookingPolicy,
    OutboxRelayJob,
    BookingEventsConsumer,
    RedisProvider,
    { provide: IDEMPOTENCY_SERVICE_NAME, useValue: 'commerce' },
  ],
})
export class CommerceModule {}
