import { DomainExceptionFilter } from '@pawmates/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { json, urlencoded, type Express } from 'express';
import { AppModule } from './app.module';

/**
 * Vercel serverless entrypoint (see README's Deploying to Vercel section)
 * — same app setup as main.ts, but exports a request handler instead of
 * calling app.listen(). `bootstrap()` only runs once per warm container
 * (cached in `bootstrapped`), matching how any other Nest app amortizes
 * its startup cost across requests instead of per-request.
 */
const server: Express = express();
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    bodyParser: false,
  });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
}

export default async function handler(
  req: import('express').Request,
  res: import('express').Response,
): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = bootstrap();
  }
  await bootstrapped;
  server(req, res);
}
