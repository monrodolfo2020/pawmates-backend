/**
 * BookingStatus (Domain Model doc §10). Transitions only move forward,
 * except into `disputed`, which can originate from `completed` (Support
 * escalates after the fact) — never from an earlier state.
 */
export enum BookingStatus {
  Requested = 'requested',
  Accepted = 'accepted',
  Confirmed = 'confirmed',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Disputed = 'disputed',
}

const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  [BookingStatus.Requested]: [
    BookingStatus.Accepted,
    BookingStatus.Confirmed,
    BookingStatus.Cancelled,
  ],
  [BookingStatus.Accepted]: [BookingStatus.Confirmed, BookingStatus.Cancelled],
  [BookingStatus.Confirmed]: [
    BookingStatus.InProgress,
    BookingStatus.Cancelled,
  ],
  [BookingStatus.InProgress]: [BookingStatus.Completed],
  [BookingStatus.Completed]: [BookingStatus.Disputed],
  [BookingStatus.Cancelled]: [],
  [BookingStatus.Disputed]: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
