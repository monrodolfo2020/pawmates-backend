import { NoUpcomingBookingError } from '@pawmates/common';
import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_PORT } from '../ports/booking.port';
import type { BookingPort } from '../ports/booking.port';

/**
 * An Order can only move to AwaitingDelivery once there's a confirmed,
 * still-future Booking between its owner and its provider — "deliver on
 * the next walk" has nowhere to deliver otherwise. Kept as its own policy
 * (Booking's NoDoubleBookingPolicy precedent) since, like that one, it
 * needs a call out of this aggregate's own data — here a cross-context
 * gRPC call rather than a same-service query.
 */
@Injectable()
export class RequiresUpcomingBookingPolicy {
  constructor(@Inject(BOOKING_PORT) private readonly booking: BookingPort) {}

  /** Returns the bookingId to attach, or null if none exists yet (retryable). */
  async findDeliveryBooking(
    ownerId: string,
    providerId: string,
  ): Promise<string | null> {
    const result = await this.booking.getUpcomingConfirmedBooking({
      ownerId,
      providerId,
    });
    return result.found ? result.bookingId : null;
  }

  /** Same lookup, but throws when the caller needs one to exist right now. */
  async assertDeliveryBooking(
    ownerId: string,
    providerId: string,
  ): Promise<string> {
    const bookingId = await this.findDeliveryBooking(ownerId, providerId);
    if (!bookingId) {
      throw new NoUpcomingBookingError(
        'Todavía no tienes un paseo agendado con este paseador.',
      );
    }
    return bookingId;
  }
}
