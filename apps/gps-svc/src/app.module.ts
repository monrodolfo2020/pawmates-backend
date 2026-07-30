import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { TripsController } from './api/trips.controller';
import { HealthController } from './health.controller';
import { KafkaProducerProvider } from './messaging/kafka-producer.provider';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, TripsController],
  providers: [KafkaProducerProvider],
})
export class AppModule {}
