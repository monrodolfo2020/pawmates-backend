import { Money } from '@pawmates/common';

/**
 * CancellationPolicy (Domain Model doc §10). Distinct per ServiceType in
 * the real Marketplace catalog; this reference implementation uses one
 * default policy (2h free window) matching the prototype's "Paseo
 * recurrente" screen copy: "puedes pausar o cancelar cualquier paseo
 * individual sin costo hasta 2h antes."
 */
export class CancellationPolicy {
  constructor(
    public readonly freeWindowHours: number,
    public readonly penaltyRate: number, // 0..1 of the booking's rate
  ) {}

  static default(): CancellationPolicy {
    return new CancellationPolicy(2, 0.5);
  }

  /** Policy P-18: within the free window, no penalty; outside it, penaltyRate. */
  calculatePenalty(scheduledAt: Date, now: Date, rateAmount: Money): Money {
    const hoursUntilService =
      (scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntilService >= this.freeWindowHours) {
      return Money.zero(rateAmount.currency);
    }
    return rateAmount.multiply(this.penaltyRate);
  }
}
