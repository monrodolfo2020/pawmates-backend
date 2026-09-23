import { ValidationError } from '@pawmates/common';

/**
 * How long a paid VIP activation lasts. Annual is deliberately cheaper
 * than 12 monthly charges (two months free at the defaults below) —
 * that discount is the whole reason to offer it.
 *
 * Must match BILLING_PERIODS in the frontend's api/client.ts —
 * checked by the app repo's scripts/check-shared-lists.mjs, which CI runs.
 */
export const BILLING_PERIODS = ['monthly', 'annual'] as const;

export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const BILLING_PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  annual: 12,
};

export function assertBillingPeriod(
  period: string,
): asserts period is BillingPeriod {
  if (!BILLING_PERIODS.includes(period as BillingPeriod)) {
    throw new ValidationError('Ese periodo de cobro no existe.');
  }
}

/**
 * Prices live in env rather than in code so they can be changed on
 * Vercel without a deploy — they're a business decision, and the one
 * thing most likely to change before any of this code does. Amounts are
 * minor units (centavos), like Money everywhere else in this codebase.
 */
function envAmount(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} debe ser un entero de centavos mayor a cero.`);
  }
  return parsed;
}

export function vipPriceCurrency(): string {
  return process.env.VIP_PRICE_CURRENCY?.trim() || 'MXN';
}

export function vipPrice(period: BillingPeriod): {
  amount: number;
  currency: string;
} {
  const amount =
    period === 'monthly'
      ? envAmount('VIP_PRICE_MONTHLY_CENTS', 9900) // $99 MXN
      : envAmount('VIP_PRICE_ANNUAL_CENTS', 99000); // $990 MXN — 2 meses gratis
  return { amount, currency: vipPriceCurrency() };
}

/**
 * Adds whole months, clamping instead of overflowing: a VIP activated on
 * the 31st and renewed monthly stays on the 31st (or the last day of a
 * shorter month) rather than silently sliding into the next month, which
 * is what a naive setMonth does with Jan 31 -> Mar 3.
 */
export function addMonths(from: Date, months: number): Date {
  const result = new Date(from.getTime());
  const dayOfMonth = result.getUTCDate();
  result.setUTCMonth(result.getUTCMonth() + months);
  if (result.getUTCDate() !== dayOfMonth) {
    result.setUTCDate(0); // back up to the last day of the intended month
  }
  return result;
}

export function periodEnd(from: Date, period: BillingPeriod): Date {
  return addMonths(from, BILLING_PERIOD_MONTHS[period]);
}
