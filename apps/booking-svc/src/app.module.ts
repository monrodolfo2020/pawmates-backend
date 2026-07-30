import { Module } from '@nestjs/common';
import { HealthController } from './api/health.controller';
import { BookingModule } from './booking.module';

@Module({
  imports: [BookingModule],
  controllers: [HealthController],
})
export class AppModule {}
