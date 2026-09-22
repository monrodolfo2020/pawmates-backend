import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { Account } from '../domain/entities/account.entity';
import { EmailVerificationCode } from '../domain/entities/email-verification-code.entity';
import { PasswordResetToken } from '../domain/entities/password-reset-token.entity';
import { ProviderVerification } from '../domain/entities/provider-verification.entity';
import { ProviderProfile } from '../../providers/domain/entities/provider-profile.entity';

// Real uploads need a network call + BLOB_READ_WRITE_TOKEN — this only
// verifies AuthService hands the right value to it, not the upload itself
// (see blob-storage.ts's own tests, if any, for that).
jest.mock('@pawmates/common', () => ({
  ...jest.requireActual('@pawmates/common'),
  uploadBase64Photo: jest.fn((dataUrl: string) => Promise.resolve(`https://blob.test/${dataUrl}`)),
  // The verification photos go to private storage, which stores a
  // pathname rather than a URL — that difference is the point, so the
  // fake mirrors it.
  uploadPrivateBase64Photo: jest.fn((dataUrl: string, folder: string) =>
    Promise.resolve(`${folder}/${dataUrl}.jpg`),
  ),
}));

describe('AuthService', () => {
  let service: AuthService;
  let accounts: jest.Mocked<
    Pick<Repository<Account>, 'findOne' | 'save' | 'findOneOrFail'>
  >;
  let verifications: jest.Mocked<
    Pick<Repository<ProviderVerification>, 'findOne' | 'save'>
  >;
  let verificationCodes: jest.Mocked<
    Pick<Repository<EmailVerificationCode>, 'findOne' | 'save'>
  >;
  let passwordResetTokens: jest.Mocked<
    Pick<Repository<PasswordResetToken>, 'findOne' | 'save'>
  >;
  let providerProfiles: jest.Mocked<Pick<Repository<ProviderProfile>, 'save'>>;
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
    // The fire-and-forget verification-email dispatch (see signup's
    // `void this.dispatchVerificationEmail(...)`) touches this on every
    // signup/login-adjacent call — findOne resolving to null keeps it on
    // the "issue a fresh code" path without erroring.
    verificationCodes = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn((v) => Promise.resolve(v as EmailVerificationCode)),
    };
    passwordResetTokens = {
      findOne: jest.fn(),
      save: jest.fn((v) => Promise.resolve(v as PasswordResetToken)),
    };
    providerProfiles = {
      save: jest.fn((p) => Promise.resolve(p as ProviderProfile)),
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };

    service = new AuthService(
      accounts as unknown as Repository<Account>,
      verifications as unknown as Repository<ProviderVerification>,
      verificationCodes as unknown as Repository<EmailVerificationCode>,
      passwordResetTokens as unknown as Repository<PasswordResetToken>,
      providerProfiles as unknown as Repository<ProviderProfile>,
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

      // A pathname, not an https URL: these went to private storage, and
      // persisting a URL for them would be persisting something anyone
      // could open (see private-blob-storage.ts).
      expect(verifications.save).toHaveBeenCalledWith(
        expect.objectContaining({
          facePhotoBase64: 'verifications/face-b64.jpg',
          idDocumentPhotoBase64: 'verifications/id-b64.jpg',
          status: 'pending',
        }),
      );
    });

    it('seeds the directory listing with the category and name picked at signup', async () => {
      accounts.findOne.mockResolvedValue(null);
      verifications.findOne.mockResolvedValue(null);

      await service.signup({
        email: 'vet@test.com',
        password: 'password123',
        role: 'provider',
        name: 'Ana Pérez',
        category: 'vet',
        businessName: 'Veterinaria San Ángel',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
      });

      expect(providerProfiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'generated-account-id',
          category: 'vet',
          businessName: 'Veterinaria San Ángel',
          isPublished: false, // no bio yet
        }),
      );
    });

    it("falls back to the person's own name when no business name is given", async () => {
      accounts.findOne.mockResolvedValue(null);
      verifications.findOne.mockResolvedValue(null);

      await service.signup({
        email: 'walker3@test.com',
        password: 'password123',
        role: 'provider',
        name: 'Lucía Paseos',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
      });

      expect(providerProfiles.save).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: 'Lucía Paseos', category: 'walker' }),
      );
    });

    it('seeds a public-page photo when the provider picks one at signup', async () => {
      accounts.findOne.mockResolvedValue(null);
      verifications.findOne.mockResolvedValue(null);

      await service.signup({
        email: 'walker2@test.com',
        password: 'password123',
        role: 'provider',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
        profilePhoto: 'face-b64', // "Usar esta fotografía" — reuses the face photo
      });

      expect(providerProfiles.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'generated-account-id',
          photoBase64: 'https://blob.test/face-b64',
          isPublished: false, // no bio/price yet — a photo alone never publishes
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

    it('seeds a public-page photo when profilePhoto is given', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.roles = ['owner'];
      accounts.findOneOrFail.mockResolvedValue(account);
      verifications.findOne.mockResolvedValue(null);

      await service.addRole('acc-1', {
        role: 'provider',
        facePhoto: 'face-b64',
        idDocumentPhoto: 'id-b64',
        profilePhoto: 'face-b64',
      });

      expect(providerProfiles.save).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acc-1', photoBase64: 'https://blob.test/face-b64' }),
      );
    });
  });

  describe('sendVerificationEmail', () => {
    it('issues a fresh code for an unverified account', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.email = 'owner@test.com';
      account.emailVerifiedAt = null;
      accounts.findOne.mockResolvedValue(account);
      verificationCodes.findOne.mockResolvedValue(null);

      await service.sendVerificationEmail('acc-1');

      expect(verificationCodes.save).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acc-1', consumedAt: null }),
      );
    });

    it('refuses to resend once the account is already verified', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.emailVerifiedAt = new Date();
      accounts.findOne.mockResolvedValue(account);

      await expect(service.sendVerificationEmail('acc-1')).rejects.toThrow(ValidationError);
      expect(verificationCodes.save).not.toHaveBeenCalled();
    });

    it('rejects an unknown account', async () => {
      accounts.findOne.mockResolvedValue(null);
      await expect(service.sendVerificationEmail('nope')).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the account verified when the code matches', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.emailVerifiedAt = null;
      accounts.findOne.mockResolvedValue(account);

      const record = EmailVerificationCode.issue('acc-1');
      verificationCodes.findOne.mockResolvedValue(record);

      await service.verifyEmail('acc-1', record.code);

      expect(account.emailVerifiedAt).not.toBeNull();
      expect(record.consumedAt).not.toBeNull();
      expect(accounts.save).toHaveBeenCalledWith(account);
      expect(verificationCodes.save).toHaveBeenCalledWith(record);
    });

    it('rejects a wrong code without verifying the account', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.emailVerifiedAt = null;
      accounts.findOne.mockResolvedValue(account);

      const record = EmailVerificationCode.issue('acc-1');
      const wrongCode = record.code === '000000' ? '111111' : '000000';
      verificationCodes.findOne.mockResolvedValue(record);

      await expect(service.verifyEmail('acc-1', wrongCode)).rejects.toThrow(ValidationError);
      expect(account.emailVerifiedAt).toBeNull();
    });

    it('is a no-op when the account is already verified', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.emailVerifiedAt = new Date();
      accounts.findOne.mockResolvedValue(account);

      await service.verifyEmail('acc-1', '123456');
      expect(accounts.save).not.toHaveBeenCalled();
      expect(verificationCodes.findOne).not.toHaveBeenCalled();
    });

    it('rejects when no code was ever requested', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.emailVerifiedAt = null;
      accounts.findOne.mockResolvedValue(account);
      verificationCodes.findOne.mockResolvedValue(null);

      await expect(service.verifyEmail('acc-1', '123456')).rejects.toThrow(ValidationError);
    });
  });

  describe('requestPasswordReset', () => {
    it('issues a fresh token for a registered email', async () => {
      const account = new Account();
      account.id = 'acc-1';
      account.email = 'owner@test.com';
      accounts.findOne.mockResolvedValue(account);
      passwordResetTokens.findOne.mockResolvedValue(null);

      await service.requestPasswordReset('Owner@Test.com');

      expect(accounts.findOne).toHaveBeenCalledWith({ where: { email: 'owner@test.com' } });
      expect(passwordResetTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'acc-1', consumedAt: null }),
      );
    });

    it('silently no-ops for an unregistered email — never reveals whether it exists', async () => {
      accounts.findOne.mockResolvedValue(null);

      await expect(service.requestPasswordReset('nobody@test.com')).resolves.toBeUndefined();
      expect(passwordResetTokens.save).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('sets a new password hash when the token is valid', async () => {
      const record = PasswordResetToken.issue('acc-1');
      passwordResetTokens.findOne.mockResolvedValue(record);
      const account = new Account();
      account.id = 'acc-1';
      account.passwordHash = 'old-hash';
      accounts.findOneOrFail.mockResolvedValue(account);

      await service.resetPassword(record.token, 'newPassword123');

      expect(record.consumedAt).not.toBeNull();
      expect(passwordResetTokens.save).toHaveBeenCalledWith(record);
      expect(account.passwordHash).not.toBe('old-hash');
      expect(await bcrypt.compare('newPassword123', account.passwordHash)).toBe(true);
      expect(accounts.save).toHaveBeenCalledWith(account);
    });

    it('rejects an unknown token', async () => {
      passwordResetTokens.findOne.mockResolvedValue(null);
      await expect(service.resetPassword('bogus', 'newPassword123')).rejects.toThrow(ValidationError);
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it('rejects an already-consumed token', async () => {
      const record = PasswordResetToken.issue('acc-1');
      record.consume();
      passwordResetTokens.findOne.mockResolvedValue(record);

      await expect(service.resetPassword(record.token, 'newPassword123')).rejects.toThrow(ValidationError);
      expect(accounts.save).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      const record = PasswordResetToken.issue('acc-1');
      record.expiresAt = new Date(Date.now() - 1000);
      passwordResetTokens.findOne.mockResolvedValue(record);

      await expect(service.resetPassword(record.token, 'newPassword123')).rejects.toThrow(ValidationError);
      expect(accounts.save).not.toHaveBeenCalled();
    });
  });
});
