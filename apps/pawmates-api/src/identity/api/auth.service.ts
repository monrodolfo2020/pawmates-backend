import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { Account } from '../domain/entities/account.entity';
import type { Role } from '../domain/entities/account.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';

const SALT_ROUNDS = 10;

export interface AuthResult {
  accountId: string;
  token: string;
  roles: Role[];
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
    private readonly jwt: JwtService,
  ) {}

  async signup(params: {
    email: string;
    password: string;
    role: 'owner' | 'provider';
    name?: string;
    facePhoto?: string;
    idDocumentPhoto?: string;
  }): Promise<AuthResult> {
    const existing = await this.accounts.findOne({
      where: { email: params.email.toLowerCase() },
    });
    if (existing) {
      throw new EmailAlreadyRegisteredError(
        'Ya existe una cuenta con ese correo.',
      );
    }

    const account = new Account();
    account.email = params.email.toLowerCase();
    account.passwordHash = await bcrypt.hash(params.password, SALT_ROUNDS);
    account.name = params.name ?? null;
    account.roles = [params.role];
    await this.accounts.save(account);

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
    }

    return this.issueToken(account);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const account = await this.accounts.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new InvalidCredentialsError('Correo o contraseña incorrectos.');
    }
    return this.issueToken(account);
  }

  async addRole(
    accountId: string,
    params: {
      role: 'owner' | 'provider';
      facePhoto?: string;
      idDocumentPhoto?: string;
    },
  ): Promise<AuthResult> {
    const account = await this.accounts.findOneOrFail({
      where: { id: accountId },
    });
    account.addRole(params.role);
    await this.accounts.save(account);

    if (params.role === 'provider') {
      await this.saveVerification(
        account.id,
        params.facePhoto!,
        params.idDocumentPhoto!,
      );
    }

    return this.issueToken(account);
  }

  private async saveVerification(
    accountId: string,
    facePhoto: string,
    idDocumentPhoto: string,
  ): Promise<void> {
    const existing = await this.verifications.findOne({
      where: { accountId },
    });
    if (existing) return; // already on file — don't overwrite a pending/verified record here
    const verification = new ProviderVerification();
    verification.accountId = accountId;
    verification.facePhotoBase64 = facePhoto;
    verification.idDocumentPhotoBase64 = idDocumentPhoto;
    verification.status = 'pending';
    await this.verifications.save(verification);
  }

  private async issueToken(account: Account): Promise<AuthResult> {
    const token = await this.jwt.signAsync({
      sub: account.id,
      roles: account.roles,
    });
    return { accountId: account.id, token, roles: account.roles };
  }
}
