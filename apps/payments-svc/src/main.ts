import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: PROTO_PACKAGES.payments,
      protoPath: protoPath('payments.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50054}`,
    },
  });

  await app.startAllMicroservices();
  const port = process.env.PORT ?? 3006;
  await app.listen(port);

  console.log(
    `payments-svc listening on :${port} (HTTP) / :${process.env.GRPC_PORT ?? 50054} (gRPC)`,
  );
}
void bootstrap();
