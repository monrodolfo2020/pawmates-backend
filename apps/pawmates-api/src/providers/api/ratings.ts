import { In, Repository } from 'typeorm';
import { Review } from '../domain/entities/review.entity';
import {
  roundAverage,
  type RatingSummary,
} from '../domain/value-objects/review-ranking';

/** Average and count of each business's reviews, in one query. A
 * business with no reviews is simply missing from the map. */
export async function loadRatings(
  reviews: Repository<Review>,
  providerIds: string[],
): Promise<Map<string, RatingSummary>> {
  if (!providerIds.length) return new Map();
  const rows = await reviews
    .createQueryBuilder('r')
    .select('r.provider_id', 'providerId')
    .addSelect('AVG(r.rating)', 'average')
    .addSelect('COUNT(*)', 'count')
    .where({ providerId: In(providerIds) })
    .groupBy('r.provider_id')
    .getRawMany<{
      providerId: string;
      average: number | string;
      count: number | string;
    }>();
  return new Map(
    rows.map((row) => [
      row.providerId,
      { average: Number(row.average), count: Number(row.count) },
    ]),
  );
}

/** What the app shows: the average to one decimal, and how many. */
export function publicRating(
  summary: RatingSummary | undefined,
): RatingSummary | null {
  return summary
    ? { average: roundAverage(summary.average), count: summary.count }
    : null;
}
