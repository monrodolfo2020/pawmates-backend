export const BOOKING_PORT = Symbol('BOOKING_PORT');

/** gRPC contract, booking.proto — GetUpcomingConfirmedBooking. */
export interface BookingPort {
  getUpcomingConfirmedBooking(params: {
    ownerId: string;
    providerId: string;
  }): Promise<{ found: boolean; bookingId: string; scheduledAt: Date | null }>;
}
