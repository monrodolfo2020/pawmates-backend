import { IsIn, IsOptional, IsUUID } from 'class-validator';

/**
 * POST /v1/auth/dev-login — no password, no real Identity aggregate. This
 * MVP has no signup/login flow of its own (see README); the point of this
 * endpoint is only to hand the frontend a token it can use against
 * JwtAuthGuard. Pass an `accountId` back on subsequent calls to keep
 * acting as the same account instead of minting a new one each time.
 */
export class DevLoginDto {
  @IsUUID()
  @IsOptional()
  accountId?: string;

  @IsIn(['owner', 'provider'])
  @IsOptional()
  role?: 'owner' | 'provider';
}
