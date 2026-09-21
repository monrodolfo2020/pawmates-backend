import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import type { BillingPeriod } from '../value-objects/billing';

/** Where a VIP activation came from. 'checkout' is a payment through the
 * billing gateway, 'code' an activation code an admin handed out (the
 * charge happened outside the app), 'admin' a courtesy flip in the admin
 * panel. */
export type ActivationSource = 'checkout' | 'code' | 'admin';

export type ActivationStatus = 'pending' | 'active' | 'cancelled';

/**
 * One attempt at putting a business on VIP — created as 'pending' when a
 * checkout starts and moved to 'active' when the payment is confirmed,
 * so an abandoned checkout leaves a row that explains itself rather than
 * nothing at all.
 *
 * This is the audit trail behind ProviderProfile.planExpiresAt: the
 * profile holds only "VIP until when", because that's the single
 * question every read (the public page, the editor) has to answer, while
 * "why, paid how, for how much" belongs in history that never gets
 * overwritten.
 */
@Entity('providers_plan_activations')
export class ProviderPlanActivation {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ type: 'text' })
  period!: BillingPeriod;

  @Column({ type: 'text' })
  source!: ActivationSource;

  @Column({ type: 'text', default: 'pending' })
  status!: ActivationStatus;

  /** The gateway's own id for this payment, or the redeemed code. Unique
   * per activation so a webhook that arrives twice can be recognised as
   * the same payment instead of granting two periods. */
  @Index({ unique: true })
  @Column({ type: 'text', nullable: true })
  reference!: string | null;

  @Column({ name: 'amount_cents', type: 'integer', nullable: true })
  amountCents!: number | null;

  @Column({ type: 'text', nullable: true })
  currency!: string | null;

  /** When the VIP this activation bought runs out — set on activation,
   * null while the checkout is still pending. */
  @Column({ name: 'expires_at', type: 'datetime', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @Column({ name: 'activated_at', type: 'datetime', nullable: true })
  activatedAt!: Date | null;

  static start(params: {
    accountId: string;
    period: BillingPeriod;
    source: ActivationSource;
    reference: string | null;
    amountCents: number | null;
    currency: string | null;
  }): ProviderPlanActivation {
    const activation = new ProviderPlanActivation();
    activation.id = ulid().toLowerCase();
    activation.accountId = params.accountId;
    activation.period = params.period;
    activation.source = params.source;
    activation.status = 'pending';
    activation.reference = params.reference;
    activation.amountCents = params.amountCents;
    activation.currency = params.currency;
    activation.expiresAt = null;
    activation.activatedAt = null;
    return activation;
  }

  markActive(expiresAt: Date, now: Date = new Date()): void {
    this.status = 'active';
    this.expiresAt = expiresAt;
    this.activatedAt = now;
  }
}
