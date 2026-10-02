import { statDay, statMonths, totalsByMonth } from './page-stats';

describe('page stats', () => {
  it('counts days in Mexico time, not UTC', () => {
    // 1 Oct 2026, 03:00 UTC is still 30 Sep in Mexico City (UTC-6).
    expect(statDay(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09-30');
    expect(statDay(new Date('2026-10-01T12:00:00Z'))).toBe('2026-10-01');
  });

  it('knows this month and the one before, across a new year', () => {
    expect(statMonths(new Date('2026-10-15T12:00:00Z'))).toEqual({
      thisMonth: '2026-10',
      lastMonth: '2026-09',
    });
    expect(statMonths(new Date('2027-01-10T12:00:00Z'))).toEqual({
      thisMonth: '2027-01',
      lastMonth: '2026-12',
    });
  });

  it('adds the daily rows up per month and kind, ignoring older months and unknown kinds', () => {
    const totals = totalsByMonth(
      [
        { day: '2026-10-01', kind: 'view', count: 3 },
        { day: '2026-10-02', kind: 'view', count: 2 },
        { day: '2026-10-02', kind: 'whatsapp', count: 1 },
        { day: '2026-09-30', kind: 'directions', count: 4 },
        { day: '2026-08-31', kind: 'view', count: 99 },
        { day: '2026-10-02', kind: 'bogus', count: 7 },
      ],
      { thisMonth: '2026-10', lastMonth: '2026-09' },
    );
    expect(totals).toEqual({
      thisMonth: { view: 5, whatsapp: 1, directions: 0 },
      lastMonth: { view: 0, whatsapp: 0, directions: 4 },
    });
  });
});
