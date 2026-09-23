import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AccountDisabledError } from '../errors/domain-error';
import { ACCOUNT_STATUS } from './account-status.port';
import type { AccountStatusPort } from './account-status.port';
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
  constructor(
    private readonly jwt: JwtService,
    // Optional so the guard still works in tests and in any module that
    // wires it up without the identity module around.
    @Optional()
    @Inject(ACCOUNT_STATUS)
    private readonly status?: AccountStatusPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('auth.token_expired');
    }
    const token = header.slice('Bearer '.length);
    let claims: { sub: string; roles: string[] };
    try {
      claims = await this.jwt.verifyAsync<{ sub: string; roles: string[] }>(token);
    } catch {
      throw new UnauthorizedException('auth.token_expired');
    }

    // Tokens here never expire, so this is the only place a suspension or
    // a deletion can take effect for someone already signed in. Checked
    // outside the try above so it surfaces as its own error rather than
    // being mistaken for a bad token.
    if (this.status && !(await this.status.isActive(claims.sub))) {
      throw new AccountDisabledError(
        'Tu cuenta está suspendida. Escríbenos si crees que es un error.',
      );
    }

    request.account = {
      accountId: claims.sub,
      roles: claims.roles ?? [],
      activeContext:
        (request.headers['x-active-context'] as 'owner' | 'provider') ??
        'owner',
    };
    return true;
  }
}
