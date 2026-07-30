import { Money } from '@pawmates/common';
import { CancellationPolicy } from './cancellation-policy';

describe('CancellationPolicy (Policy P-18)', () => {
  const rate = Money.of(5000, 'USD');

  it('charges no penalty outside the free window', () => {
    const policy = CancellationPolicy.default();
    const scheduledAt = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-08-01T09:00:00Z'); // 3h before, >= 2h free window

    const penalty = policy.calculatePenalty(scheduledAt, now, rate);

    expect(penalty.amount).toBe(0);
    expect(penalty.currency).toBe('USD');
  });

  it('charges no penalty exactly at the free window boundary', () => {
    const policy = CancellationPolicy.default();
    const scheduledAt = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-08-01T10:00:00Z'); // exactly 2h before

    const penalty = policy.calculatePenalty(scheduledAt, now, rate);

    expect(penalty.amount).toBe(0);
  });

  it('charges the penalty rate once inside the free window', () => {
    const policy = CancellationPolicy.default();
    const scheduledAt = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-08-01T11:00:00Z'); // 1h before, < 2h window

    const penalty = policy.calculatePenalty(scheduledAt, now, rate);

    expect(penalty.amount).toBe(2500); // 50% of 5000
  });

  it('charges the penalty rate for a cancellation after the scheduled time', () => {
    const policy = CancellationPolicy.default();
    const scheduledAt = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-08-01T13:00:00Z'); // after the walk started

    const penalty = policy.calculatePenalty(scheduledAt, now, rate);

    expect(penalty.amount).toBe(2500);
  });

  it('supports non-default free windows and penalty rates', () => {
    const policy = new CancellationPolicy(24, 1);
    const scheduledAt = new Date('2026-08-01T12:00:00Z');
    const now = new Date('2026-08-01T00:00:00Z'); // 12h before, < 24h window

    const penalty = policy.calculatePenalty(scheduledAt, now, rate);

    expect(penalty.amount).toBe(5000); // 100% of 5000
  });
});
