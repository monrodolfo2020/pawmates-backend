import { NoUpcomingBookingError } from '@pawmates/common';
import { Inject, Injectable } from '@nestjs/common';
import { BOOKING_PORT } from '../ports/booking.port';
import type { BookingPort } from '../ports/booking.port';

export interface DeliveryBooking {
  bookingId: string;
  providerId: string;
}

/**
 * An Order can only move to AwaitingDelivery once there's a confirmed,
 * still-future Booking for its owner — "deliver on the next walk" has
 * nowhere to deliver otherwise. Not scoped to a specific provider: the
 * store is one platform-wide shop now (see Storefront's comment), so
 * whichever walker the owner's own next confirmed walk happens to be
 * with is who delivers the order — that's why this also returns
 * `providerId`, stamped onto the Order at attach time (see
 * Order.attachDeliveryBooking) rather than carried by the store itself.
 *
 * Kept as its own policy (Booking's NoDoubleBookingPolicy precedent)
 * since, like that one, it needs a call out of this aggregate's own data
 * — here a cross-context gRPC call rather than a same-service query.
 */
@Injectable()
export class RequiresUpcomingBookingPolicy {
  constructor(@Inject(BOOKING_PORT) private readonly booking: BookingPort) {}

  /** Returns the booking to attach, or null if none exists yet (retryable). */
  async findDeliveryBooking(ownerId: string): Promise<DeliveryBooking | null> {
    const result = await this.booking.getUpcomingConfirmedBooking({ ownerId });
    return result.found
      ? { bookingId: result.bookingId, providerId: result.providerId }
      : null;
  }

  /** Same lookup, but throws when the caller needs one to exist right now. */
  async assertDeliveryBooking(ownerId: string): Promise<DeliveryBooking> {
    const booking = await this.findDeliveryBooking(ownerId);
    if (!booking) {
      throw new NoUpcomingBookingError(
        'Todavía no tienes un paseo agendado para recibir este pedido.',
      );
    }
    return booking;
  }
}
