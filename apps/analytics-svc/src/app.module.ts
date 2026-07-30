import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Skeleton only (Prompt 5 scope: booking-svc gets the full saga, every
 * other Bounded Context gets scaffolding to prove out the monorepo/build
 * pipeline). Domain layer, persistence, and API surface are still to be
 * built out per this context's section of the Domain Model / API Design
 * docs.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController],
})
export class AppModule {}
