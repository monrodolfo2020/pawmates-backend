import { ValidationError } from '@pawmates/common';
import { PlanActivationCode } from './plan-activation-code.entity';

describe('PlanActivationCode', () => {
  it('generates a code people can read out loud', () => {
    const code = PlanActivationCode.generate({ period: 'monthly' });
    expect(code.code).toHaveLength(8);
    // No characters that get confused when typed off a message.
    expect(code.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(code.usedCount).toBe(0);
    expect(code.maxUses).toBe(1);
  });

  it('rejects an unknown period and an impossible use count', () => {
    expect(() => PlanActivationCode.generate({ period: 'semanal' })).toThrow(ValidationError);
    expect(() => PlanActivationCode.generate({ period: 'monthly', maxUses: 0 })).toThrow(
      ValidationError,
    );
  });

  it('normalizes what the business typed', () => {
    expect(PlanActivationCode.normalize(' ab3d-9k2m ')).toBe('AB3D9K2M');
  });

  it('spends a single-use code exactly once', () => {
    const code = PlanActivationCode.generate({ period: 'monthly' });
    code.redeem();
    expect(code.isSpent).toBe(true);
    expect(() => code.redeem()).toThrow(ValidationError);
  });

  it('lets a multi-use code be redeemed up to its limit', () => {
    const code = PlanActivationCode.generate({ period: 'annual', maxUses: 3 });
    code.redeem();
    code.redeem();
    expect(code.isSpent).toBe(false);
    code.redeem();
    expect(code.isSpent).toBe(true);
    expect(() => code.redeem()).toThrow(ValidationError);
  });

  it('refuses a code past its expiry', () => {
    const code = PlanActivationCode.generate({
      period: 'monthly',
      expiresAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(() => code.redeem(new Date('2026-02-01T00:00:00Z'))).toThrow(ValidationError);
    expect(code.usedCount).toBe(0);
  });
});
