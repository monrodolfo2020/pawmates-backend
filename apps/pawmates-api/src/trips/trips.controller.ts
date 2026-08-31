import { CurrentAccount, JwtAuthGuard, RoleRequiredError, ValidationError } from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ulid } from 'ulid';
import { Booking } from '../booking/domain/entities/booking.entity';
import { BookingStatus } from '../booking/domain/value-objects/booking-status';
import { TripLocation } from '../booking/domain/entities/trip-location.entity';
import { WalkEvent } from '../booking/domain/entities/walk-event.entity';
import { BookingProcessManager } from '../booking/domain/saga/booking-process-manager';
import { CommerceProcessManager } from '../commerce/domain/saga/commerce-process-manager';
import { LogLocationDto } from './dto/log-location.dto';
import { LogWalkEventDto } from './dto/log-walk-event.dto';

/**
 * Trip API (API Design doc §05: "POST /v1/trips/{id}/start|complete"),
 * plus live GPS tracking and the post-walk Report Card. Real gps-svc
 * would own location ingestion, geofencing, and the Trip aggregate;
 * consolidating into one deployable (this MVP, see README) means the two
 * things that used to react to gps.events/TripStarted and TripCompleted
 * over Kafka — BookingProcessManager and CommerceProcessManager — can
 * just be called directly, in the same request, instead of through a
 * broker.
 *
 * GET /v1/trips/:bookingId serves both the live map (while `in_progress`
 * — the owner's app polls it) and the finished Report Card (once
 * `completed`) from the same underlying data, since a route/photo log is
 * just as valid mid-walk as after it — no separate "live" endpoint.
 */
@Controller('v1/trips')
@UseGuards(JwtAuthGuard)
export class TripsController {
  constructor(
    private readonly bookingProcessManager: BookingProcessManager,
    private readonly commerceProcessManager: CommerceProcessManager,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(TripLocation)
    private readonly tripLocations: Repository<TripLocation>,
    @InjectRepository(WalkEvent)
    private readonly walkEvents: Repository<WalkEvent>,
  ) {}

  @Post(':bookingId/start')
  async start(
    @Param('bookingId') bookingId: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    await this.assertIsAssignedProvider(bookingId, account);
    await this.bookingProcessManager.markInProgress(bookingId);
    return { data: { status: 'started' } };
  }

  @Post(':bookingId/complete')
  async complete(
    @Param('bookingId') bookingId: string,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    await this.assertIsAssignedProvider(bookingId, account);
    const trace = traceId ?? ulid().toLowerCase();
    await this.bookingProcessManager.completeService(bookingId, trace);
    // Was a separate consumer reacting to booking.events/WalkFinished —
    // now just the next line, since it's the same process.
    await this.commerceProcessManager.openDeliveryWindowForBooking(bookingId);
    return { data: { status: 'completed' } };
  }

  @Post(':bookingId/locations')
  async logLocation(
    @Param('bookingId') bookingId: string,
    @Body() dto: LogLocationDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const booking = await this.assertIsAssignedProvider(bookingId, account);
    this.assertInProgress(booking);
    const point = TripLocation.record(
      bookingId,
      dto.lat,
      dto.lng,
      dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
    );
    await this.tripLocations.save(point);
    return { data: { id: point.id } };
  }

  @Post(':bookingId/events')
  async logEvent(
    @Param('bookingId') bookingId: string,
    @Body() dto: LogWalkEventDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const booking = await this.assertIsAssignedProvider(bookingId, account);
    this.assertInProgress(booking);
    const event = WalkEvent.log({
      bookingId,
      type: dto.type,
      photoBase64: dto.photoBase64,
      note: dto.note,
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: new Date(),
    });
    await this.walkEvents.save(event);
    return { data: { id: event.id } };
  }

  @Get(':bookingId')
  async getTrip(
    @Param('bookingId') bookingId: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const booking = await this.bookings.findOneOrFail({ where: { id: bookingId } });
    this.assertIsParticipant(booking, account);

    const [route, events] = await Promise.all([
      this.tripLocations.find({
        where: { bookingId },
        order: { recordedAt: 'ASC' },
      }),
      this.walkEvents.find({
        where: { bookingId },
        order: { recordedAt: 'ASC' },
      }),
    ]);

    const durationSeconds = booking.startedAt
      ? Math.round(
          ((booking.completedAt ?? new Date()).getTime() -
            booking.startedAt.getTime()) /
            1000,
        )
      : null;

    return {
      data: {
        bookingId,
        status: booking.status,
        startedAt: booking.startedAt,
        completedAt: booking.completedAt,
        durationSeconds,
        distanceMeters: routeDistanceMeters(route),
        route: route.map((p) => ({ lat: p.lat, lng: p.lng, recordedAt: p.recordedAt })),
        events: events.map((e) => ({
          id: e.id,
          type: e.type,
          photoBase64: e.photoBase64,
          note: e.note,
          recordedAt: e.recordedAt,
        })),
        peeCount: events.filter((e) => e.type === 'pee').length,
        poopCount: events.filter((e) => e.type === 'poop').length,
      },
    };
  }

  private async assertIsAssignedProvider(
    bookingId: string,
    account: AuthenticatedAccount,
  ): Promise<Booking> {
    const booking = await this.bookings.findOneOrFail({ where: { id: bookingId } });
    if (booking.providerId !== account.accountId) {
      throw new RoleRequiredError('Solo el paseador asignado puede hacer esto.');
    }
    return booking;
  }

  private assertIsParticipant(booking: Booking, account: AuthenticatedAccount): void {
    if (
      booking.ownerId !== account.accountId &&
      booking.providerId !== account.accountId &&
      !account.roles.includes('admin')
    ) {
      throw new RoleRequiredError('No tienes acceso a este paseo.');
    }
  }

  private assertInProgress(booking: Booking): void {
    if (booking.status !== BookingStatus.InProgress) {
      throw new ValidationError('El paseo no está en curso.');
    }
  }
}

/** Haversine sum across consecutive route points — good enough for a walking-pace route. */
function routeDistanceMeters(route: TripLocation[]): number {
  const EARTH_RADIUS_METERS = 6_371_000;
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1];
    const b = route[i];
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
    total += 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
  }
  return Math.round(total);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
