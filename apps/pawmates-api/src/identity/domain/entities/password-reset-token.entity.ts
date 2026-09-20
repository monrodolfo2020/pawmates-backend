import { ValidationError } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';
import { randomBytes } from 'crypto';
import { ulid } from 'ulid';

const EXPIRY_MINUTES = 60;

/**
 * PasswordResetToken — one active token per account (`accountId` unique,
 * same "a new request overwrites the old one" behavior as
 * EmailVerificationCode). Unlike that 6-digit code, `token` is a 256-bit
 * random value embedded straight into the emailed reset link (see
 * send-password-reset-email.ts) rather than something a person types, so
 * it has to resist guessing on its own — hence crypto.randomBytes
 * instead of EmailVerificationCode's short numeric code.
 */
@Entity({ name: 'identity_password_reset_tokens' })
export class PasswordResetToken {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'account_id', type: 'text', unique: true })
  accountId!: string;

  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  static issue(accountId: string): PasswordResetToken {
    const entity = new PasswordResetToken();
    entity.id = ulid().toLowerCase();
    entity.accountId = accountId;
    entity.token = randomBytes(32).toString('hex');
    entity.expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
    entity.consumedAt = null;
    return entity;
  }

  /** Throws rather than returning a bool — same reasoning as
   * EmailVerificationCode.assertValid. */
  assertValid(): void {
    if (this.consumedAt) {
      throw new ValidationError('Este enlace ya fue usado. Pide uno nuevo.');
    }
    if (this.expiresAt.getTime() < Date.now()) {
      throw new ValidationError('Este enlace ya venció. Pide uno nuevo.');
    }
  }

  consume(): void {
    this.consumedAt = new Date();
  }
}
