import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ulid } from 'ulid';
import { BookingProcessManager } from '../booking/domain/saga/booking-process-manager';
import { CommerceProcessManager } from '../commerce/domain/saga/commerce-process-manager';

/**
 * Trip API (API Design doc §05: "POST /v1/trips/{id}/start|complete").
 * Real gps-svc would own location ingestion, geofencing, and the Trip
 * aggregate; consolidating into one deployable (this MVP, see README)
 * means the two things that used to react to gps.events/TripStarted and
 * TripCompleted over Kafka — BookingProcessManager and
 * CommerceProcessManager — can just be called directly, in the same
 * request, instead of through a broker.
 */
@Controller('v1/trips')
export class TripsController {
  constructor(
    private readonly bookingProcessManager: BookingProcessManager,
    private readonly commerceProcessManager: CommerceProcessManager,
  ) {}

  @Post(':bookingId/start')
  async start(@Param('bookingId') bookingId: string) {
    await this.bookingProcessManager.markInProgress(bookingId);
    return { data: { status: 'started' } };
  }

  @Post(':bookingId/complete')
  async complete(
    @Param('bookingId') bookingId: string,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const trace = traceId ?? ulid().toLowerCase();
    await this.bookingProcessManager.completeService(bookingId, trace);
    // Was a separate consumer reacting to booking.events/WalkFinished —
    // now just the next line, since it's the same process.
    await this.commerceProcessManager.openDeliveryWindowForBooking(bookingId);
    return { data: { status: 'completed' } };
  }
}
