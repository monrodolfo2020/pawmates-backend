import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: PROTO_PACKAGES.trustSafety,
      protoPath: protoPath('trust-safety.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50053}`,
    },
  });

  await app.startAllMicroservices();
  const port = process.env.PORT ?? 3002;
  await app.listen(port);

  console.log(
    `trust-safety-svc listening on :${port} (HTTP) / :${process.env.GRPC_PORT ?? 50053} (gRPC)`,
  );
}
void bootstrap();
