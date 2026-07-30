import { PROTO_PACKAGES, protoPath } from '@pawmates/proto';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: PROTO_PACKAGES.marketplace,
      protoPath: protoPath('marketplace.proto'),
      url: `0.0.0.0:${process.env.GRPC_PORT ?? 50052}`,
    },
  });

  await app.startAllMicroservices();
  const port = process.env.PORT ?? 3004;
  await app.listen(port);

  console.log(
    `marketplace-svc listening on :${port} (HTTP) / :${process.env.GRPC_PORT ?? 50052} (gRPC)`,
  );
}
void bootstrap();
