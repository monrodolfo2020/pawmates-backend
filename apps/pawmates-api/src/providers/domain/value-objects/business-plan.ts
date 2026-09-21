/**
 * What a business pays for. 'free' gets the fixed PawMates micro-page;
 * 'vip' unlocks the design editor (see page-design.ts).
 *
 * This is a stored field rather than something derived from a
 * subscription record because a business can arrive on VIP three
 * different ways (see ActivationSource): a payment through the gateway,
 * an activation code, or an admin granting it by hand. What they share
 * is the answer, not the route.
 *
 * Never read `plan === 'vip'` to decide whether VIP is in force — a paid
 * plan expires and leaves `plan` alone on purpose, so that a renewal
 * brings the business's design back untouched. ProviderProfile.isVip()
 * is the question worth asking.
 *
 * Must stay in sync with BUSINESS_PLANS in the frontend's api/client.ts.
 */
export const BUSINESS_PLANS = ['free', 'vip'] as const;

export type BusinessPlan = (typeof BUSINESS_PLANS)[number];

export const DEFAULT_BUSINESS_PLAN: BusinessPlan = 'free';
