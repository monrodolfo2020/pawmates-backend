/**
 * What a business in the PawMates directory actually does. The app
 * started as walkers-only — 'walker' stays the default so every profile
 * that predates the directory keeps behaving exactly as before (bookings,
 * Meet & Greet, live walk); the other categories are directory listings
 * with a contact button instead, since there's no booking pipeline for
 * a vet appointment or a grooming slot yet.
 *
 * 'shop' was here and was removed: a store's page is mostly a product
 * catalogue, which is a different product from a services listing and
 * was more than a shop owner could reasonably fill in. Rows that had it
 * were moved to 'other' (see RemoveShopCategory).
 *
 * Must match SERVICE_CATEGORIES in the frontend's api/client.ts —
 * checked by the app repo's scripts/check-shared-lists.mjs, which CI runs.
 */
export const SERVICE_CATEGORIES = [
  'walker',
  'vet',
  'grooming',
  'boarding',
  'training',
  'other',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const DEFAULT_SERVICE_CATEGORY: ServiceCategory = 'walker';

/** Only walkers carry a per-walk rate and the booking flow that needs it
 * — see ProviderProfile's publish rule. */
export function requiresRate(category: ServiceCategory): boolean {
  return category === 'walker';
}

/**
 * URL-safe id for a business's shareable micro-page (/s/<slug>).
 * Accent-folded so "Estética Canina Güero" becomes "estetica-canina-guero"
 * rather than percent-escaping into something unshareable. Returns '' for
 * input with no usable characters at all — callers fall back to the
 * account id in that case, since a page still needs *some* address.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
