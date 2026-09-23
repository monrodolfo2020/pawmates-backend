import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The address of whoever sent the request.
 *
 * Behind Vercel, the socket belongs to Vercel's edge, so `req.ip` is
 * useless; Vercel sets `x-real-ip` and `x-forwarded-for` to the client's
 * address and overwrites whatever the client sent in them, so they can
 * be trusted there. Run behind another proxy that only appends to
 * x-forwarded-for, the first entry could be forged — which would only
 * weaken the per-connection limits, never the per-account ones.
 */
export function clientIpOf(request: Request): string {
  const real = request.headers['x-real-ip'];
  if (typeof real === 'string' && real.trim()) return real.trim();
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',')[0]
    ?.trim();
  if (first) return first;
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/** `@ClientIp() ip: string` — see clientIpOf. */
export const ClientIp = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) =>
    clientIpOf(ctx.switchToHttp().getRequest<Request>()),
);
