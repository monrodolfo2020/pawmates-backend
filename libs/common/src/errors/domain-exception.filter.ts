import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainError } from './domain-error';

/**
 * Maps every thrown error to the common envelope from the API Design doc
 * (Sheet 4, §03/§11): { error: { code, message, retryable }, meta: { traceId } }.
 * DomainError subclasses carry their own HTTP status and code; anything
 * else becomes an opaque 500 so internal details never leak to a client.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

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
    response.status(500).json({
      error: {
        code: 'internal.unexpected',
        message: 'Ocurrió un error inesperado.',
        retryable: true,
      },
      meta: { traceId },
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
  };
  return messages[code] ?? 'Ocurrió un error.';
}
