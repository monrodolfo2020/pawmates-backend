import { ValidationError } from '@pawmates/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

const CODE_LENGTH = 6;
const EXPIRY_MINUTES = 15;

function generateCode(): string {
  // A 6-digit numeric code, zero-padded — easy to type from an email on
  // a phone, same shape as the OTP codes most people already recognize.
  const n = Math.floor(Math.random() * 10 ** CODE_LENGTH);
  return String(n).padStart(CODE_LENGTH, '0');
}

/**
 * EmailVerificationCode — one active code per account (`accountId`
 * unique; a new send overwrites the old one, so only the most recent
 * code is ever valid, matching how OTP flows in most apps behave).
 *
 * Stored in plaintext, not hashed — a 6-digit code with a 15-minute
 * expiry and single-use consumption already caps the blast radius of a
 * database read to "guess one of a million codes before it expires",
 * which doesn't justify the extra complexity of hashing here (same
 * tradeoff logic as this codebase's other secrets, e.g. JWT_SECRET
 * being a plain env var rather than a rotated key).
 */
@Entity({ name: 'identity_email_verification_codes' })
export class EmailVerificationCode {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'account_id', type: 'text', unique: true })
  accountId!: string;

  @Column({ type: 'text' })
  code!: string;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;

  @Column({ name: 'consumed_at', type: 'datetime', nullable: true })
  consumedAt!: Date | null;

  /** Set when the code confirms a change of address rather than the
   * current one: it was sent to this address, and entering it makes this
   * the account's email. Null for the signup verification. */
  @Column({ name: 'new_email', type: 'text', nullable: true })
  newEmail!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  static issue(
    accountId: string,
    newEmail: string | null = null,
  ): EmailVerificationCode {
    const entity = new EmailVerificationCode();
    entity.id = ulid().toLowerCase();
    entity.accountId = accountId;
    entity.reissue(newEmail);
    return entity;
  }

  /** A fresh code on the same row — one active code per account, so a
   * new one (for either purpose) replaces whatever was pending. */
  reissue(newEmail: string | null = null): void {
    this.code = generateCode();
    this.expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000);
    this.consumedAt = null;
    this.newEmail = newEmail;
  }

  /** Throws rather than returning a bool — every caller needs the same
   * specific message, and forgetting to check a bool is an easy bug. */
  assertValid(code: string): void {
    if (this.consumedAt) {
      throw new ValidationError('Este código ya fue usado. Pide uno nuevo.');
    }
    if (this.expiresAt.getTime() < Date.now()) {
      throw new ValidationError('Este código ya venció. Pide uno nuevo.');
    }
    if (this.code !== code) {
      throw new ValidationError('Código incorrecto.');
    }
  }

  consume(): void {
    this.consumedAt = new Date();
  }
}
