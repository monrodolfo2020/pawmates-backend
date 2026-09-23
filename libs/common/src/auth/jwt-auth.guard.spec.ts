import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { AccountDisabledError } from '../errors/domain-error';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AccountStatusPort } from './account-status.port';

function contextWith(authorization?: string) {
  const request: { headers: Record<string, string>; account?: unknown } = {
    headers: authorization ? { authorization } : {},
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

const jwtReturning = (claims: object | Error) =>
  ({
    verifyAsync: jest.fn(() =>
      claims instanceof Error ? Promise.reject(claims) : Promise.resolve(claims),
    ),
  }) as unknown as JwtService;

const statusSaying = (active: boolean, roles: string[] = ['owner']): AccountStatusPort => ({
  standing: jest.fn().mockResolvedValue({ active, roles }),
});

describe('JwtAuthGuard', () => {
  it('lets an active account through and attaches it to the request', async () => {
    const guard = new JwtAuthGuard(
      jwtReturning({ sub: 'acc-1', roles: ['owner'] }),
      statusSaying(true),
    );
    const { context, request } = contextWith('Bearer good');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.account).toMatchObject({ accountId: 'acc-1', roles: ['owner'] });
  });

  it('turns away a suspended account even with a valid token', async () => {
    // Tokens here don't expire. Without this check a suspension would
    // only stop new logins, and everyone already signed in would keep
    // using the app indefinitely.
    const guard = new JwtAuthGuard(
      jwtReturning({ sub: 'acc-1', roles: ['provider'] }),
      statusSaying(false),
    );
    const { context } = contextWith('Bearer still-valid');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AccountDisabledError);
  });

  it('reports a bad token as a bad token, not as a suspension', async () => {
    const status = statusSaying(true);
    const guard = new JwtAuthGuard(jwtReturning(new Error('bad signature')), status);
    const { context } = contextWith('Bearer forged');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    // No point asking about an account the token doesn't prove.
    expect(status.standing).not.toHaveBeenCalled();
  });

  it('takes roles from the account, not from the token', async () => {
    // A token claiming admin for an account that isn't one gets the
    // account's real roles instead.
    const guard = new JwtAuthGuard(
      jwtReturning({ sub: 'acc-1', roles: ['owner', 'admin'] }),
      statusSaying(true, ['owner']),
    );
    const { context, request } = contextWith('Bearer claims-admin');

    await guard.canActivate(context);
    expect(request.account).toMatchObject({ roles: ['owner'] });
  });

  it('refuses a request with no token at all', async () => {
    const guard = new JwtAuthGuard(jwtReturning({ sub: 'x', roles: [] }), statusSaying(true));
    const { context } = contextWith();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
