import { Module } from '@nestjs/common';
import { HealthController } from './api/health.controller';
import { CommerceModule } from './commerce.module';

@Module({
  imports: [CommerceModule],
  controllers: [HealthController],
})
export class AppModule {}
