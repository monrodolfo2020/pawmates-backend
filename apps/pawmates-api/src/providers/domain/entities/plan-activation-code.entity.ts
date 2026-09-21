import { ValidationError } from '@pawmates/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { assertBillingPeriod } from '../value-objects/billing';
import type { BillingPeriod } from '../value-objects/billing';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
const CODE_LENGTH = 8;

/**
 * A code an admin hands a business so it can turn on VIP itself, once
 * it has paid by transfer, cash or anything else that never touched the
 * app. It exists because there's no payment gateway wired up yet (see
 * billing.port.ts) and "the admin flips a switch for every customer"
 * doesn't survive more than a handful of them.
 *
 * Codes are typed by a person, so the alphabet drops the characters
 * people confuse (O/0, I/1) and redemption is case-insensitive.
 */
@Entity('providers_plan_codes')
export class PlanActivationCode {
  @PrimaryColumn({ type: 'text' })
  code!: string;

  @Column({ type: 'text' })
  period!: BillingPeriod;

  /** Free-text reminder of who this was for — an admin looking at a list
   * of codes months later has no other way to tell them apart. */
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ name: 'max_uses', type: 'integer', default: 1 })
  maxUses!: number;

  @Column({ name: 'used_count', type: 'integer', default: 0 })
  usedCount!: number;

  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  static generate(params: {
    period: string;
    note?: string | null;
    maxUses?: number;
    expiresAt?: Date | null;
  }): PlanActivationCode {
    assertBillingPeriod(params.period);
    const maxUses = params.maxUses ?? 1;
    if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 500) {
      throw new ValidationError('Los usos deben ser un número entre 1 y 500.');
    }

    const code = new PlanActivationCode();
    code.code = Array.from(
      { length: CODE_LENGTH },
      () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)],
    ).join('');
    code.period = params.period;
    code.note = params.note?.trim() || null;
    code.maxUses = maxUses;
    code.usedCount = 0;
    code.expiresAt = params.expiresAt ?? null;
    return code;
  }

  /** Codes are stored and compared in one canonical shape, so "abcd-1234"
   * typed with a stray dash or in lower case still finds its row. */
  static normalize(raw: string): string {
    return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  get isSpent(): boolean {
    return this.usedCount >= this.maxUses;
  }

  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt !== null && this.expiresAt.getTime() <= now.getTime();
  }

  redeem(now: Date = new Date()): void {
    if (this.isSpent) {
      throw new ValidationError('Ese código ya fue utilizado.');
    }
    if (this.isExpired(now)) {
      throw new ValidationError('Ese código ya venció.');
    }
    this.usedCount += 1;
  }
}
