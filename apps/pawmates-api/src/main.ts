import { DomainExceptionFilter } from '@pawmates/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`pawmates-api listening on :${port}`);
}
void bootstrap();
