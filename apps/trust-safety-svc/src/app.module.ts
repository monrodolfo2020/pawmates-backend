import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { TrustSafetyGrpcController } from './trust-safety.grpc-controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, TrustSafetyGrpcController],
})
export class AppModule {}
