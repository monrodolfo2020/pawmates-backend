/**
 * RecurrenceRule (Domain Model doc §10). endCondition is a tagged union
 * so RecurrenceExpansionService never has to guess which field is live.
 */
export type RecurrenceEndCondition =
  | { type: 'date'; value: string } // ISO date, inclusive
  | { type: 'count'; value: number }; // number of occurrences

export interface RecurrenceRule {
  daysOfWeek: number[]; // 0=Sun..6=Sat
  timeOfDay: string; // "HH:mm"
  endCondition: RecurrenceEndCondition;
}

/** Generates the next N scheduled dates for a recurrence, starting from `from`. */
export function expandOccurrences(
  rule: RecurrenceRule,
  from: Date,
  maxOccurrences: number,
): Date[] {
  const [hour, minute] = rule.timeOfDay.split(':').map(Number);
  const results: Date[] = [];
  const cursor = new Date(from);
  cursor.setHours(hour, minute, 0, 0);

  // Inclusive of the whole end date (per the type's own doc comment),
  // not just up to midnight — otherwise any timeOfDay after 00:00 would
  // wrongly drop the last day of the range.
  const endDate =
    rule.endCondition.type === 'date'
      ? new Date(new Date(rule.endCondition.value).setHours(23, 59, 59, 999))
      : null;
  const maxCount =
    rule.endCondition.type === 'count'
      ? rule.endCondition.value
      : maxOccurrences;

  let safety = 0;
  while (results.length < Math.min(maxCount, maxOccurrences) && safety < 400) {
    safety++;
    if (rule.daysOfWeek.includes(cursor.getDay()) && cursor >= from) {
      if (endDate && cursor > endDate) break;
      results.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return results;
}
