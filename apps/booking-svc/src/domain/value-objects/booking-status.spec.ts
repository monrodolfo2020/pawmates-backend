import { BookingStatus, canTransition } from './booking-status';

describe('canTransition (Booking state machine)', () => {
  it('allows the full happy path Requested -> ... -> Completed', () => {
    expect(canTransition(BookingStatus.Requested, BookingStatus.Accepted)).toBe(
      true,
    );
    expect(canTransition(BookingStatus.Accepted, BookingStatus.Confirmed)).toBe(
      true,
    );
    expect(
      canTransition(BookingStatus.Confirmed, BookingStatus.InProgress),
    ).toBe(true);
    expect(
      canTransition(BookingStatus.InProgress, BookingStatus.Completed),
    ).toBe(true);
  });

  it('allows cancellation from Requested, Accepted, and Confirmed', () => {
    expect(
      canTransition(BookingStatus.Requested, BookingStatus.Cancelled),
    ).toBe(true);
    expect(canTransition(BookingStatus.Accepted, BookingStatus.Cancelled)).toBe(
      true,
    );
    expect(
      canTransition(BookingStatus.Confirmed, BookingStatus.Cancelled),
    ).toBe(true);
  });

  it('never allows cancelling an in-progress booking', () => {
    expect(
      canTransition(BookingStatus.InProgress, BookingStatus.Cancelled),
    ).toBe(false);
  });

  it('only allows Disputed to originate from Completed', () => {
    expect(canTransition(BookingStatus.Completed, BookingStatus.Disputed)).toBe(
      true,
    );
    expect(canTransition(BookingStatus.Requested, BookingStatus.Disputed)).toBe(
      false,
    );
    expect(
      canTransition(BookingStatus.InProgress, BookingStatus.Disputed),
    ).toBe(false);
  });

  it('treats Cancelled and Disputed as terminal states', () => {
    expect(
      canTransition(BookingStatus.Cancelled, BookingStatus.Requested),
    ).toBe(false);
    expect(canTransition(BookingStatus.Disputed, BookingStatus.Completed)).toBe(
      false,
    );
  });

  it('never allows skipping backwards', () => {
    expect(
      canTransition(BookingStatus.Completed, BookingStatus.InProgress),
    ).toBe(false);
    expect(
      canTransition(BookingStatus.InProgress, BookingStatus.Requested),
    ).toBe(false);
  });
});
