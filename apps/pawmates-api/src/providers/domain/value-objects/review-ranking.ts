/**
 * How the directory ranks businesses by their reviews.
 *
 * A plain average would put a business with a single 5-bone review above
 * one with forty reviews averaging 4.8. So each business's average is
 * pulled toward a neutral prior — as if it started with PRIOR_WEIGHT
 * reviews of PRIOR_MEAN bones — and the pull fades as real reviews
 * arrive (a Bayesian average). Businesses with reviews come first, best
 * score first; the ones without any keep the directory's usual order
 * (newest first) after them.
 */
export const PRIOR_MEAN = 3;
export const PRIOR_WEIGHT = 3;

export type RatingSummary = { average: number; count: number };

export function rankingScore({ average, count }: RatingSummary): number {
  return (PRIOR_MEAN * PRIOR_WEIGHT + average * count) / (PRIOR_WEIGHT + count);
}

/** Sorts `items` (already newest first) by their rating. Stable: equal
 * scores and the unreviewed keep the order they came in. */
export function rankByRating<T>(
  items: T[],
  ratingOf: (item: T) => RatingSummary | null,
): T[] {
  const reviewed: Array<{
    item: T;
    score: number;
    count: number;
    index: number;
  }> = [];
  const unreviewed: T[] = [];
  items.forEach((item, index) => {
    const rating = ratingOf(item);
    if (rating && rating.count > 0) {
      reviewed.push({
        item,
        score: rankingScore(rating),
        count: rating.count,
        index,
      });
    } else {
      unreviewed.push(item);
    }
  });
  reviewed.sort(
    (a, b) => b.score - a.score || b.count - a.count || a.index - b.index,
  );
  return [...reviewed.map((r) => r.item), ...unreviewed];
}

/** One decimal, the way the app shows it ("4.7"). */
export function roundAverage(average: number): number {
  return Math.round(average * 10) / 10;
}
