export const BOOKING_PORT = Symbol('BOOKING_PORT');

/**
 * gRPC contract, booking.proto — GetUpcomingConfirmedBooking. Scoped only
 * to the owner, not a specific provider — Commerce now sells from one
 * platform-wide store (see Storefront's comment), not a per-walker shop,
 * so "who delivers this order" is whichever walker the owner's own next
 * confirmed walk happens to be with, not a fixed relationship the store
 * itself carries.
 */
export interface BookingPort {
  getUpcomingConfirmedBooking(params: {
    ownerId: string;
  }): Promise<{
    found: boolean;
    bookingId: string;
    providerId: string;
    scheduledAt: Date | null;
  }>;
}
