import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface AuthenticatedAccount {
  accountId: string;
  roles: string[];
  activeContext: 'owner' | 'provider';
}

declare module 'express' {
  interface Request {
    account?: AuthenticatedAccount;
  }
}

/**
 * Validates the access token issued by the OIDC provider (Architecture
 * ADR-06). Real deployments verify against identity-svc's cached JWKS;
 * this reference implementation verifies against a shared HMAC secret
 * (see each app's .env.example) — swap the verification strategy, not
 * the shape of AuthenticatedAccount, when identity-svc grows a real
 * JWKS endpoint.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('auth.token_expired');
    }
    const token = header.slice('Bearer '.length);
    try {
      const claims = await this.jwt.verifyAsync<{
        sub: string;
        roles: string[];
      }>(token);
      request.account = {
        accountId: claims.sub,
        roles: claims.roles ?? [],
        activeContext:
          (request.headers['x-active-context'] as 'owner' | 'provider') ??
          'owner',
      };
      return true;
    } catch {
      throw new UnauthorizedException('auth.token_expired');
    }
  }
}
