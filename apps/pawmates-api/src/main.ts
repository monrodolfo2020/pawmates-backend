import { DomainExceptionFilter } from '@pawmates/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';

async function bootstrap() {
  // Express's default 100kb body limit is too small for base64 photo
  // uploads (provider face/ID photos, pet photos — see identity module) —
  // disable the default parser Nest wires in and register our own with
  // more headroom.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.enableCors(); // demo frontend calls this from a browser (Expo web) — no cookies/credentials involved
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Passing the DataSource lets the filter self-heal a stale Turso/Hrana
  // stream (see its own comment) instead of leaving every request on this
  // warm instance broken until Vercel cycles to a fresh one.
  app.useGlobalFilters(new DomainExceptionFilter(app.get(DataSource)));
  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`pawmates-api listening on :${port}`);
}
void bootstrap();
