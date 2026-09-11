import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { DataSource } from 'typeorm';
import { DomainError } from './domain-error';

// Turso/libSQL's HTTP (Hrana) transport still keeps a stateful stream
// under the hood (a "baton" the client reuses across queries) — see
// libsql-connection.ts's comment on why the connection URL is rewritten
// to https:// in the first place. That stream can still go stale (Turso
// closes idle ones, or a cold start's very first query can just fail),
// and once it does, the same warm serverless instance keeps reusing the
// now-broken stream: every later request fails identically until Vercel
// happens to cycle to a fresh instance. `stream not found` in the error
// message is libsql's own wording for exactly this.
const STALE_TURSO_STREAM_PATTERN = /stream not found/i;

/**
 * Maps every thrown error to the common envelope from the API Design doc
 * (Sheet 4, §03/§11): { error: { code, message, retryable }, meta: { traceId } }.
 * DomainError subclasses carry their own HTTP status and code; anything
 * else becomes an opaque 500 so internal details never leak to a client.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);
  private healing = false;

  // Optional: main.ts passes the app's DataSource so this filter can
  // self-heal a stale Turso stream (see STALE_TURSO_STREAM_PATTERN);
  // omit it (e.g. in a unit test) and that path is just a no-op.
  constructor(private readonly dataSource?: DataSource) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const traceId = (request.headers['x-trace-id'] as string) ?? undefined;

    if (exception instanceof DomainError) {
      response.status(exception.httpStatus).json({
        error: {
          code: exception.code,
          message: exception.message || defaultMessageFor(exception.code),
          retryable: exception.retryable,
        },
        meta: { traceId },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json({
        error: {
          code: 'http.error',
          message: exception.message,
          retryable: status >= 500,
        },
        meta: { traceId },
      });
      return;
    }

    this.logger.error('Unhandled exception', exception as Error);
    if (STALE_TURSO_STREAM_PATTERN.test((exception as Error)?.message ?? '')) {
      this.healConnection();
    }
    response.status(500).json({
      error: {
        code: 'internal.unexpected',
        message: 'Ocurrió un error inesperado.',
        retryable: true,
      },
      meta: { traceId },
    });
  }

  // Fire-and-forget, deliberately not awaited: the current (already
  // failed) request gets its response immediately either way. Recycling
  // the DataSource means a concurrent request mid-query on the same
  // instance could see its connection close out from under it — a real
  // but narrow risk, and strictly better than every request on this
  // instance failing identically until Vercel cycles to a fresh one.
  private healConnection(): void {
    if (!this.dataSource || this.healing) return;
    this.healing = true;
    this.dataSource
      .destroy()
      .then(() => this.dataSource!.initialize())
      .then(() => this.logger.warn('Reconnected after a stale Turso/Hrana stream.'))
      .catch((err) =>
        this.logger.error('Failed to reconnect after a stale stream', err as Error),
      )
      .finally(() => {
        this.healing = false;
      });
  }
}

function defaultMessageFor(code: string): string {
  const messages: Record<string, string> = {
    'booking.provider_double_booked':
      'Este proveedor ya tiene un servicio confirmado en ese horario.',
    'booking.cannot_cancel_in_progress':
      'No puedes cancelar un paseo que ya comenzó.',
    'reviews.not_eligible': 'Solo puedes reseñar un servicio ya completado.',
    'trust_safety.verification_required':
      'Este proveedor no tiene el nivel de verificación requerido.',
    'resource.not_found': 'No encontramos lo que buscas.',
    'validation.invalid_field': 'Revisa los datos enviados.',
    'commerce.insufficient_stock':
      'Ya no hay suficiente stock de este producto.',
    'commerce.delivery_not_ready':
      'Aún no puedes confirmar la entrega — el paseo todavía no termina.',
    'commerce.no_upcoming_booking':
      'Todavía no tienes un paseo agendado con este paseador.',
    'auth.email_already_registered': 'Ya existe una cuenta con ese correo.',
    'auth.invalid_credentials': 'Correo o contraseña incorrectos.',
    'auth.role_required': 'No tienes permiso para esto.',
  };
  return messages[code] ?? 'Ocurrió un error.';
}
