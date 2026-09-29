import { rankByRating, rankingScore } from './review-ranking';

type Row = { id: string; rating: { average: number; count: number } | null };

const ids = (rows: Row[]) =>
  rankByRating(rows, (r) => r.rating).map((r) => r.id);

describe('review ranking', () => {
  it('puts reviewed businesses first, best score first', () => {
    expect(
      ids([
        { id: 'new', rating: null },
        { id: 'ok', rating: { average: 3.5, count: 10 } },
        { id: 'great', rating: { average: 4.8, count: 20 } },
      ]),
    ).toEqual(['great', 'ok', 'new']);
  });

  it('does not let one perfect review beat many very good ones', () => {
    expect(rankingScore({ average: 5, count: 1 })).toBeLessThan(
      rankingScore({ average: 4.6, count: 30 }),
    );
    expect(
      ids([
        { id: 'one-five', rating: { average: 5, count: 1 } },
        { id: 'many', rating: { average: 4.6, count: 30 } },
      ]),
    ).toEqual(['many', 'one-five']);
  });

  it('keeps the incoming (newest first) order for ties and for the unreviewed', () => {
    expect(
      ids([
        { id: 'a', rating: null },
        { id: 'b', rating: { average: 4, count: 2 } },
        { id: 'c', rating: { average: 0, count: 0 } },
        { id: 'd', rating: { average: 4, count: 2 } },
      ]),
    ).toEqual(['b', 'd', 'a', 'c']);
  });

  it('breaks an equal score by the number of reviews', () => {
    expect(
      ids([
        { id: 'few', rating: { average: 3, count: 1 } },
        { id: 'more', rating: { average: 3, count: 5 } },
      ]),
    ).toEqual(['more', 'few']);
  });
});
