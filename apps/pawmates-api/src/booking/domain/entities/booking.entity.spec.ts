import { BookingCannotCancelInProgressError, Money } from '@pawmates/common';
import { Booking } from './booking.entity';
import { PriceBreakdown } from './price-breakdown.entity';
import { BookingStatus } from '../value-objects/booking-status';

function makeBooking(): Booking {
  return Booking.request({
    ownerId: 'owner-1',
    providerId: 'provider-1',
    scheduledAt: new Date('2026-08-01T12:00:00Z'),
    idempotencyKey: 'idem-1',
    lines: [
      {
        petId: 'pet-1',
        serviceTypeCode: 'walk',
        durationValue: 30,
        durationUnit: 'min',
        addressId: 'addr-1',
      },
    ],
  });
}

function makePriceBreakdown(bookingId: string): PriceBreakdown {
  const rate = Money.of(5000, 'USD');
  return PriceBreakdown.create({
    bookingId,
    rate,
    commission: Money.of(500, 'USD'),
    tax: Money.of(0, 'USD'),
    tipEstimate: Money.of(0, 'USD'),
    total: rate,
  });
}

describe('Booking aggregate', () => {
  it('starts in Requested status with a generated id', () => {
    const booking = makeBooking();
    expect(booking.status).toBe(BookingStatus.Requested);
    expect(booking.id).toBeTruthy();
  });

  it('walks the happy path through accept/confirm/start/complete', () => {
    const booking = makeBooking();
    const pb = makePriceBreakdown(booking.id);

    booking.accept();
    expect(booking.status).toBe(BookingStatus.Accepted);

    booking.confirm(pb);
    expect(booking.status).toBe(BookingStatus.Confirmed);
    expect(booking.priceBreakdown).toBe(pb);

    booking.start();
    expect(booking.status).toBe(BookingStatus.InProgress);

    booking.complete();
    expect(booking.status).toBe(BookingStatus.Completed);
  });

  it('throws on an invalid transition (e.g. completing before starting)', () => {
    const booking = makeBooking();
    expect(() => booking.complete()).toThrow(/Invalid Booking transition/);
  });

  it('refuses to cancel a booking that is already in progress', () => {
    const booking = makeBooking();
    const pb = makePriceBreakdown(booking.id);
    booking.accept();
    booking.confirm(pb);
    booking.start();

    expect(() => booking.cancel('owner-1', null, Money.zero('USD'))).toThrow(
      BookingCannotCancelInProgressError,
    );
    expect(booking.status).toBe(BookingStatus.InProgress);
  });

  it('cancels a Requested booking and returns a cancellation record', () => {
    const booking = makeBooking();
    const penalty = Money.of(2500, 'USD');

    const record = booking.cancel('owner-1', 'no longer needed', penalty);

    expect(booking.status).toBe(BookingStatus.Cancelled);
    expect(record.bookingId).toBe(booking.id);
    expect(record.cancelledBy).toBe('owner-1');
    expect(record.penaltyAmount).toBe(2500);
    expect(record.penaltyCurrency).toBe('USD');
  });

  it('creates a pending reschedule request without changing status', () => {
    const booking = makeBooking();
    const proposedStart = new Date('2026-08-02T12:00:00Z');

    const request = booking.requestReschedule(proposedStart, 'owner-1');

    expect(request.bookingId).toBe(booking.id);
    expect(request.status).toBe('pending');
    expect(request.proposedStart).toBe(proposedStart);
    expect(booking.status).toBe(BookingStatus.Requested);
  });

  it('exposes rateAmount as Money derived from its priceBreakdown', () => {
    const booking = makeBooking();
    booking.priceBreakdown = makePriceBreakdown(booking.id);

    expect(booking.rateAmount.equals(Money.of(5000, 'USD'))).toBe(true);
  });
});
