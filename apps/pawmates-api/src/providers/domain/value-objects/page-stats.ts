/**
 * What a business can see about its own page: how many people opened it,
 * and how many went on to contact it or ask for directions. Counted per
 * day, in Mexico's time, so "este mes" means the month the business is
 * living in rather than UTC's.
 *
 * Only counts, never who: a row is (business, day, kind, count).
 */
export const PAGE_STAT_KINDS = ['view', 'whatsapp', 'directions'] as const;
export type PageStatKind = (typeof PAGE_STAT_KINDS)[number];

export const isPageStatKind = (value: unknown): value is PageStatKind =>
  PAGE_STAT_KINDS.includes(value as PageStatKind);

const TIME_ZONE = 'America/Mexico_City';

/** "2026-10-02" for the given instant, in Mexico's time. */
export function statDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "2026-10" and the month before it, for the given instant. */
export function statMonths(now: Date = new Date()): {
  thisMonth: string;
  lastMonth: string;
} {
  const [year, month] = statDay(now).split('-').map(Number);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    thisMonth: `${year}-${pad(month)}`,
    lastMonth: `${prevYear}-${pad(prevMonth)}`,
  };
}

export type StatTotals = Record<PageStatKind, number>;

const zero = (): StatTotals => ({ view: 0, whatsapp: 0, directions: 0 });

/** Adds daily rows up into one total per kind for each of the two months. */
export function totalsByMonth(
  rows: { day: string; kind: string; count: number }[],
  months: { thisMonth: string; lastMonth: string },
): { thisMonth: StatTotals; lastMonth: StatTotals } {
  const thisMonth = zero();
  const lastMonth = zero();
  for (const row of rows) {
    if (!isPageStatKind(row.kind)) continue;
    const target = row.day.startsWith(months.thisMonth)
      ? thisMonth
      : row.day.startsWith(months.lastMonth)
        ? lastMonth
        : null;
    if (target) target[row.kind] += Number(row.count);
  }
  return { thisMonth, lastMonth };
}
