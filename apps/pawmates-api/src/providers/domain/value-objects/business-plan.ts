/**
 * What a business pays for. 'free' gets the fixed PawMates micro-page;
 * 'vip' unlocks the design editor (see page-design.ts).
 *
 * There's no payment flow yet — an admin flips this by hand
 * (PATCH /v1/admin/businesses/:accountId/plan) and the charge happens
 * outside the app, which is the whole reason this is a stored field
 * rather than something derived from a subscription record.
 *
 * Must stay in sync with BUSINESS_PLANS in the frontend's api/client.ts.
 */
export const BUSINESS_PLANS = ['free', 'vip'] as const;

export type BusinessPlan = (typeof BUSINESS_PLANS)[number];

export const DEFAULT_BUSINESS_PLAN: BusinessPlan = 'free';
