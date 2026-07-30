import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3012;
  await app.listen(port);

  console.log(`marketing-svc listening on :${port}`);
}
void bootstrap();
