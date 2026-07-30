import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MARKETPLACE_PORT } from '../../domain/ports/marketplace.port';
import { PAYMENTS_PORT } from '../../domain/ports/payments.port';
import { TRUST_SAFETY_PORT } from '../../domain/ports/trust-safety.port';
import {
  MARKETPLACE_GRPC_CLIENT,
  MarketplaceGrpcClient,
} from './marketplace.grpc-client';
import {
  PAYMENTS_GRPC_CLIENT,
  PaymentsGrpcClient,
} from './payments.grpc-client';
import {
  TRUST_SAFETY_GRPC_CLIENT,
  TrustSafetyGrpcClient,
} from './trust-safety.grpc-client';

/**
 * Registers the three gRPC clients booking-svc calls synchronously
 * (Architecture ADR-03 / §08) and binds each to the domain-facing port
 * interface the saga depends on — the saga never imports @nestjs/microservices.
 */
@Module({
  imports: [
    ClientsModule.register([
      {
        name: MARKETPLACE_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: PROTO_PACKAGES.marketplace,
          protoPath: protoPath('marketplace.proto'),
          url: process.env.MARKETPLACE_GRPC_URL ?? 'localhost:50052',
        },
      },
      {
        name: TRUST_SAFETY_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: PROTO_PACKAGES.trustSafety,
          protoPath: protoPath('trust-safety.proto'),
          url: process.env.TRUST_SAFETY_GRPC_URL ?? 'localhost:50053',
        },
      },
      {
        name: PAYMENTS_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: PROTO_PACKAGES.payments,
          protoPath: protoPath('payments.proto'),
          url: process.env.PAYMENTS_GRPC_URL ?? 'localhost:50054',
        },
      },
    ]),
  ],
  providers: [
    MarketplaceGrpcClient,
    TrustSafetyGrpcClient,
    PaymentsGrpcClient,
    { provide: MARKETPLACE_PORT, useExisting: MarketplaceGrpcClient },
    { provide: TRUST_SAFETY_PORT, useExisting: TrustSafetyGrpcClient },
    { provide: PAYMENTS_PORT, useExisting: PaymentsGrpcClient },
  ],
  exports: [MARKETPLACE_PORT, TRUST_SAFETY_PORT, PAYMENTS_PORT],
})
export class GrpcClientsModule {}
