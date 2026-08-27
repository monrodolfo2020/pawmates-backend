import { randomUUID } from 'crypto';
import { Body, Controller, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DevLoginDto } from './dto/dev-login.dto';

/**
 * No Identity Bounded Context exists in this MVP (see README) — this is
 * the one dev-only shortcut that lets a client get a token JwtAuthGuard
 * will accept, without a real signup/login flow behind it. Never gates
 * on a password; anyone can mint a token for any accountId they choose.
 * Fine for this MVP's demo frontend, not for anything with real users.
 */
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly jwt: JwtService) {}

  @Post('dev-login')
  async devLogin(@Body() dto: DevLoginDto) {
    const accountId = dto.accountId ?? randomUUID();
    const token = await this.jwt.signAsync({
      sub: accountId,
      roles: [dto.role ?? 'owner'],
    });
    return { data: { accountId, token } };
  }
}
