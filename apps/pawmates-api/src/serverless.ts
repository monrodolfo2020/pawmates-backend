import { DomainExceptionFilter } from '@pawmates/common';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express, { json, urlencoded, type Express } from 'express';
import { DataSource } from 'typeorm';
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
    // Nest's default is process.exit(1) on a startup error, which takes
    // the function down before handler() below can say what went wrong.
    abortOnError: false,
  });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Same as main.ts: with the DataSource the filter can recover a stale
  // Turso stream on this warm instance instead of failing every request.
  app.useGlobalFilters(new DomainExceptionFilter(app.get(DataSource)));
  await app.init();
}

export default async function handler(
  req: import('express').Request,
  res: import('express').Response,
): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = bootstrap();
  }
  try {
    await bootstrapped;
  } catch (err) {
    // A startup failure (a missing JWT_SECRET, say) would otherwise stay
    // cached in `bootstrapped` and crash every request with no clue why.
    // Log the reason, answer with something readable, and let the next
    // request try again — e.g. after the variable has been set.
    bootstrapped = null;
    console.error('pawmates-api failed to start:', err);
    res.status(503).json({
      error: {
        code: 'server.misconfigured',
        message: 'El servicio no está disponible por un problema de configuración.',
        retryable: true,
      },
      meta: {},
    });
    return;
  }
  server(req, res);
}
