import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RoleRequiredError } from '../errors/domain-error';

/**
 * Admin-only, for a whole controller. Goes after JwtAuthGuard, which is
 * what puts the account (with its roles as stored, not as the token
 * claims them) on the request:
 *
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Checking once per controller instead of inside every handler means a
 * new admin endpoint can't be left open by forgetting the check.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const account = context.switchToHttp().getRequest<Request>().account;
    if (!account?.roles.includes('admin')) {
      throw new RoleRequiredError(
        'Esta acción requiere el rol de administrador.',
      );
    }
    return true;
  }
}
