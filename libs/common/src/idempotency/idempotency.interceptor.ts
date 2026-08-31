import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { IdempotencyKey } from './idempotency-key.entity';
import { IDEMPOTENCY_SERVICE_NAME } from './service-name.token';

const TTL_MS = 24 * 60 * 60 * 1000; // Data Model doc §11: idem:* — 24h

/**
 * DB-backed idempotency (Data Model doc §11, key pattern
 * `idem:{service}:{idempotency_key}` — was a Redis hash before the Turso
 * migration, see README's Database section). A repeated request with the
 * same Idempotency-Key inside the TTL window returns the first response
 * verbatim instead of re-running the handler — this is what makes
 * retrying `POST /bookings` after a dropped connection safe.
 *
 * Registered via Nest's DI (each context provides IDEMPOTENCY_SERVICE_NAME
 * and imports IdempotencyKey via TypeOrmModule.forFeature) so
 * `@UseInterceptors(IdempotencyInterceptor)` works like any other Nest
 * interceptor — no manual `new` at the call site.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyKeys: Repository<IdempotencyKey>,
    @Inject(IDEMPOTENCY_SERVICE_NAME) private readonly serviceName: string,
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

    const dbKey = `idem:${this.serviceName}:${key}`;
    const cached = await this.idempotencyKeys.findOne({ where: { key: dbKey } });
    if (cached && cached.expiresAt.getTime() > Date.now()) {
      response.status(cached.responseStatus);
      return of(cached.responseBody);
    }

    return next.handle().pipe(
      tap((body: unknown) => {
        void this.idempotencyKeys.save({
          key: dbKey,
          responseStatus: response.statusCode || 200,
          responseBody: body,
          expiresAt: new Date(Date.now() + TTL_MS),
        });
      }),
    );
  }
}
