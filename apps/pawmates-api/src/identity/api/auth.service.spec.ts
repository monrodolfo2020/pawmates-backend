import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
} from '@pawmates/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Account } from '../domain/entities/account.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';

describe('AuthService', () => {
  let service: AuthService;
  let accounts: jest.Mocked<
    Pick<Repository<Account>, 'findOne' | 'save' | 'findOneOrFail'>
  >;
  let verifications: jest.Mocked<
    Pick<Repository<ProviderVerification>, 'findOne' | 'save'>
  >;
  let jwt: jest.Mocked<Pick<JwtService, 'signAsync'>>;

  beforeEach(() => {
    accounts = {
      findOne: jest.fn(),
      // Mimics TypeORM populating a @PrimaryGeneratedColumn back onto the
      // entity after INSERT — the real DB does this, this mock doesn't
      // unless told to.
      save: jest.fn((a) => {
        const account = a as Account;
        account.id ??= 'generated-account-id';
        return Promise.resolve(account);
      }),
      findOneOrFail: jest.fn(),
    };
    verifications = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v as ProviderVerification)),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };

    service = new AuthService(
      accounts as unknown as Repository<Account>,
      verifications as unknown as Repository<ProviderVerification>,
      jwt as unknown as JwtService,
    );
  });

  describe('signup', () => {
    it('creates an owner account with a hashed password and issues a token', async () => {
      accounts.findOne.mockResolvedValue(null);

      const result = await service.signup({
        email: 'Owner@Test.com',
        password: 'password123',
        role: 'owner',
      });

      expect(result).toEqual({
        accountId: expect.any(String),
        token: 'signed-token',
        roles: ['owner'],
      });
      const saved = accounts.save.mock.calls[0][0] as Account;
      expect(saved.email).toBe('owner@test.com'); // normalized to lowercase
      expect(saved.passwordHash).not.toBe('password123');
      expect(await bcrypt.compare('password123', saved.passwordHash)).toBe(
        true,
      );
      expect(verifications.save).not.toHaveBeenCalled();
    });

    it('refuses a second signup with the same email', async () => {
      accounts.findOne.mockResolvedValue(new Account());

      await expect(
        service.signup({
          email: 'owner@test.com',
          password: 'password123',
          role: 'owner',
        }),
      ).rejects.toThrow(EmailAlreadyRegisteredError);
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it('stores a pending ProviderVerification when signing up as a provider', async () => {
      accounts.findOne.mockResolvedValue(null);
      verifications.findOne.mockResolvedValue(null);

      await service.signup({
        email: 'walker@test.com',
        password: 'password123',
        role: 'provider',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
      });

      expect(verifications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          facePhotoBase64: 'face-b64',
          idDocumentPhotoBase64: 'id-b64',
          status: 'pending',
        }),
      );
    });
  });

  describe('login', () => {
    it('issues a token when the password matches', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.passwordHash = await bcrypt.hash('password123', 4);
      account.roles = ['owner'];
      accounts.findOne.mockResolvedValue(account);

      const result = await service.login('owner@test.com', 'password123');

      expect(result.accountId).toBe('acc-1');
      expect(result.token).toBe('signed-token');
    });

    it('rejects a wrong password', async () => {
      const account = new Account();
      account.passwordHash = await bcrypt.hash('password123', 4);
      accounts.findOne.mockResolvedValue(account);

      await expect(service.login('owner@test.com', 'wrong')).rejects.toThrow(
        InvalidCredentialsError,
      );
    });

    it('rejects an unknown email without revealing that distinction', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(
        service.login('nobody@test.com', 'password123'),
      ).rejects.toThrow(InvalidCredentialsError);
    });
  });

  describe('addRole', () => {
    it('appends a new role to an existing account', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.roles = ['owner'];
      accounts.findOneOrFail.mockResolvedValue(account);
      verifications.findOne.mockResolvedValue(null);

      const result = await service.addRole('acc-1', {
        role: 'provider',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
      });

      expect(result.roles).toEqual(['owner', 'provider']);
      expect(verifications.save).toHaveBeenCalled();
    });
  });
});
