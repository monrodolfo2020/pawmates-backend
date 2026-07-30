import { ConfigModule } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MarketplaceGrpcController } from './marketplace.grpc-controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [HealthController, MarketplaceGrpcController],
})
export class AppModule {}
