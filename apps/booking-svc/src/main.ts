import { DomainExceptionFilter } from '@pawmates/common';
import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());

  // gRPC server for BookingService.GetUpcomingConfirmedBooking — the one
  // inbound gRPC call on top of the REST API above (commerce-svc's
  // RequiresUpcomingBookingPolicy; see api/booking.grpc-controller.ts).
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: PROTO_PACKAGES.booking,
      protoPath: protoPath('booking.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50055}`,
    },
  });
  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3005;
  await app.listen(port);

  console.log(
    `booking-svc listening on :${port} (HTTP) / :${process.env.GRPC_PORT ?? 50055} (gRPC)`,
  );
}
void bootstrap();
