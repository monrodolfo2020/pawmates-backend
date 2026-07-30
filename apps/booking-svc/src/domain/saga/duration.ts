import type { CreateBookingLineCommand } from './commands';

const UNIT_TO_MINUTES: Record<
  CreateBookingLineCommand['durationUnit'],
  number
> = {
  min: 1,
  hour: 60,
  day: 1440,
};

/** The provider is occupied for the longest line in a multi-line Booking. */
export function longestDurationMinutes(
  lines: CreateBookingLineCommand[],
): number {
  return Math.max(
    ...lines.map((l) => l.durationValue * UNIT_TO_MINUTES[l.durationUnit]),
  );
}
