import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PaymentsGrpcController } from './payments.grpc-controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, PaymentsGrpcController],
})
export class AppModule {}
