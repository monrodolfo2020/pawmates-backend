import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { REDIS_CLIENT } from './redis.token';

const TTL_SECONDS = 24 * 60 * 60; // Data Model doc §11: idem:* — 24h

/**
 * Redis-backed idempotency (Data Model doc §11, key pattern
 * `idem:{service}:{idempotency_key}`; API Design doc §03/Principio 02).
 * A repeated request with the same Idempotency-Key inside the TTL window
 * returns the first response verbatim instead of re-running the handler —
 * this is what makes retrying `POST /bookings` after a dropped connection
 * safe.
 *
 * Registered via Nest's DI (each service provides REDIS_CLIENT and its
 * own SERVICE_NAME token) so `@UseInterceptors(IdempotencyInterceptor)`
 * works like any other Nest interceptor — no manual `new` at the call site.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject('IDEMPOTENCY_SERVICE_NAME') private readonly serviceName: string,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = request.headers['idempotency-key'] as string | undefined;

    if (!key) {
      return next.handle();
    }

    const redisKey = `idem:${this.serviceName}:${key}`;
    const cached = await this.redis.get(redisKey);
    if (cached) {
      const { status, body } = JSON.parse(cached) as {
        status: number;
        body: unknown;
      };
      response.status(status);
      return of(body);
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.redis.set(
          redisKey,
          JSON.stringify({ status: response.statusCode || 200, body }),
          'EX',
          TTL_SECONDS,
        );
      }),
    );
  }
}
