import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3013;
  await app.listen(port);

  console.log(`analytics-svc listening on :${port}`);
}
void bootstrap();
