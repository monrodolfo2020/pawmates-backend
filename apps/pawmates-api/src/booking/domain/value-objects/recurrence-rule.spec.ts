import { expandOccurrences, RecurrenceRule } from './recurrence-rule';

describe('expandOccurrences', () => {
  it('generates the requested count, one per matching weekday', () => {
    // 2026-08-03 is a Monday.
    const rule: RecurrenceRule = {
      daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
      timeOfDay: '09:00',
      endCondition: { type: 'count', value: 4 },
    };
    const from = new Date('2026-08-03T00:00:00');

    const occurrences = expandOccurrences(rule, from, 10);

    expect(occurrences).toHaveLength(4);
    for (const date of occurrences) {
      expect([1, 3, 5]).toContain(date.getDay());
      expect(date.getHours()).toBe(9);
      expect(date.getMinutes()).toBe(0);
    }
  });

  it('never returns more than maxOccurrences even if count asks for more', () => {
    const rule: RecurrenceRule = {
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // every day
      timeOfDay: '08:00',
      endCondition: { type: 'count', value: 100 },
    };
    const from = new Date('2026-08-03T00:00:00');

    const occurrences = expandOccurrences(rule, from, 4);

    expect(occurrences).toHaveLength(4);
  });

  it('stops at the end date for a date-bound recurrence', () => {
    const rule: RecurrenceRule = {
      daysOfWeek: [1], // every Monday
      timeOfDay: '09:00',
      endCondition: { type: 'date', value: '2026-08-17T00:00:00' },
    };
    const from = new Date('2026-08-03T00:00:00'); // Monday

    const occurrences = expandOccurrences(rule, from, 20);

    // Mondays: Aug 3, 10, 17 fall within range; Aug 24 is past the end date.
    expect(occurrences).toHaveLength(3);
    expect(occurrences[occurrences.length - 1].getDate()).toBe(17);
  });

  it('returns an empty array when no weekday matches', () => {
    const rule: RecurrenceRule = {
      daysOfWeek: [],
      timeOfDay: '09:00',
      endCondition: { type: 'count', value: 4 },
    };
    const from = new Date('2026-08-03T00:00:00');

    expect(expandOccurrences(rule, from, 10)).toEqual([]);
  });
});
