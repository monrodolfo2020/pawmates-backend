import type { ExecutionContext } from '@nestjs/common';
import { RoleRequiredError } from '../errors/domain-error';
import { AdminGuard } from './admin.guard';

const contextFor = (account?: { roles: string[] }) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ account }) }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  it('lets an admin through', () => {
    expect(
      new AdminGuard().canActivate(contextFor({ roles: ['owner', 'admin'] })),
    ).toBe(true);
  });

  it('turns away anyone else', () => {
    expect(() =>
      new AdminGuard().canActivate(contextFor({ roles: ['provider'] })),
    ).toThrow(RoleRequiredError);
  });

  it('turns away a request JwtAuthGuard never saw', () => {
    expect(() => new AdminGuard().canActivate(contextFor(undefined))).toThrow(
      RoleRequiredError,
    );
  });
});
