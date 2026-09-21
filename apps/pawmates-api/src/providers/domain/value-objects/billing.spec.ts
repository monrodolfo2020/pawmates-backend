import { ValidationError } from '@pawmates/common';
import { addMonths, assertBillingPeriod, periodEnd, vipPrice } from './billing';

describe('billing value objects', () => {
  const OLD_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('defaults to $99 MXN a month and $990 a year — two months free', () => {
    delete process.env.VIP_PRICE_MONTHLY_CENTS;
    delete process.env.VIP_PRICE_ANNUAL_CENTS;
    delete process.env.VIP_PRICE_CURRENCY;
    expect(vipPrice('monthly')).toEqual({ amount: 9900, currency: 'MXN' });
    expect(vipPrice('annual')).toEqual({ amount: 99000, currency: 'MXN' });
    expect(vipPrice('annual').amount).toBeLessThan(vipPrice('monthly').amount * 12);
  });

  it('takes prices from the environment so they change without a deploy', () => {
    process.env.VIP_PRICE_MONTHLY_CENTS = '14900';
    process.env.VIP_PRICE_CURRENCY = 'USD';
    expect(vipPrice('monthly')).toEqual({ amount: 14900, currency: 'USD' });
  });

  it('refuses a price that is not whole centavos', () => {
    process.env.VIP_PRICE_MONTHLY_CENTS = '99.50';
    expect(() => vipPrice('monthly')).toThrow();
  });

  it('rejects an unknown period', () => {
    expect(() => assertBillingPeriod('semanal')).toThrow(ValidationError);
  });

  it('keeps the day of the month when adding months', () => {
    expect(addMonths(new Date('2026-01-15T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    );
  });

  it('clamps instead of overflowing into the next month', () => {
    // Jan 31 + 1 month is Feb 28, not Mar 3 — the naive setMonth answer.
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(addMonths(new Date('2024-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2024-02-29T00:00:00.000Z', // leap year
    );
  });

  it('turns a period into an end date', () => {
    const from = new Date('2026-03-10T12:00:00Z');
    expect(periodEnd(from, 'monthly').toISOString()).toBe('2026-04-10T12:00:00.000Z');
    expect(periodEnd(from, 'annual').toISOString()).toBe('2027-03-10T12:00:00.000Z');
  });
});
