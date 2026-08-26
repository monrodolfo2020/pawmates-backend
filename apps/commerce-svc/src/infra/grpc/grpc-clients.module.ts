import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BOOKING_PORT } from '../../domain/ports/booking.port';
import { PAYMENTS_PORT } from '../../domain/ports/payments.port';
import { TRUST_SAFETY_PORT } from '../../domain/ports/trust-safety.port';
import { BOOKING_GRPC_CLIENT, BookingGrpcClient } from './booking.grpc-client';
import {
  PAYMENTS_GRPC_CLIENT,
  PaymentsGrpcClient,
} from './payments.grpc-client';
import {
  TRUST_SAFETY_GRPC_CLIENT,
  TrustSafetyGrpcClient,
} from './trust-safety.grpc-client';

/**
 * Registers the three gRPC clients commerce-svc calls synchronously and
 * binds each to the domain-facing port interface the saga depends on —
 * the saga never imports @nestjs/microservices (GrpcClientsModule
 * precedent, booking-svc).
 */
@Module({
  imports: [
    ClientsModule.register([
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
      {
        name: BOOKING_GRPC_CLIENT,
        transport: Transport.GRPC,
        options: {
          package: PROTO_PACKAGES.booking,
          protoPath: protoPath('booking.proto'),
          url: process.env.BOOKING_GRPC_URL ?? 'localhost:50055',
        },
      },
    ]),
  ],
  providers: [
    TrustSafetyGrpcClient,
    PaymentsGrpcClient,
    BookingGrpcClient,
    { provide: TRUST_SAFETY_PORT, useExisting: TrustSafetyGrpcClient },
    { provide: PAYMENTS_PORT, useExisting: PaymentsGrpcClient },
    { provide: BOOKING_PORT, useExisting: BookingGrpcClient },
  ],
  exports: [TRUST_SAFETY_PORT, PAYMENTS_PORT, BOOKING_PORT],
})
export class GrpcClientsModule {}
