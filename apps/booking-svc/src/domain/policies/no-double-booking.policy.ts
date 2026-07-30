import { BookingProviderDoubleBookedError } from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { BookingStatus } from '../value-objects/booking-status';

const ACTIVE_STATUSES = [
  BookingStatus.Accepted,
  BookingStatus.Confirmed,
  BookingStatus.InProgress,
];

/**
 * Policy P-14 / P-17 (Domain Model doc §10): a ServiceProvider whose
 * ProviderService has capacity=1 (walk, vet visit, training — everything
 * except boarding/daycare) can't hold two overlapping active Bookings.
 *
 * The authoritative `capacity` value lives in marketplace.provider_services
 * (a skeleton service in this prompt), so this reference implementation
 * always enforces the capacity=1 rule — the common case for the services
 * modeled in the prototype (dog walking). A production version would
 * first fetch capacity via MarketplaceClient and skip this check entirely
 * for capacity>1 offerings (boarding, daycare).
 *
 * Overlap is computed against each existing booking's own line durations
 * (joined, not assumed) so a 90-minute walk correctly blocks a slot that
 * starts 30 minutes into it.
 */
@Injectable()
export class NoDoubleBookingPolicy {
  constructor(
    @InjectRepository(Booking)
    private readonly bookings: Repository<Booking>,
  ) {}

  async assertAvailable(
    providerId: string,
    scheduledAt: Date,
    durationMinutes: number,
  ): Promise<void> {
    const windowEnd = new Date(
      scheduledAt.getTime() + durationMinutes * 60_000,
    );

    const overlapping = await this.bookings
      .createQueryBuilder('b')
      .innerJoin(
        (qb) =>
          qb
            .select('bl.booking_id', 'booking_id')
            .addSelect(
              `MAX(bl.duration_value * CASE bl.duration_unit
                 WHEN 'min' THEN 1 WHEN 'hour' THEN 60 WHEN 'day' THEN 1440 END)`,
              'duration_minutes',
            )
            .from('booking.booking_lines', 'bl')
            .groupBy('bl.booking_id'),
        'dur',
        'dur.booking_id = b.id',
      )
      .where('b.provider_id = :providerId', { providerId })
      .andWhere('b.status IN (:...statuses)', { statuses: ACTIVE_STATUSES })
      .andWhere('b.scheduled_at < :windowEnd', { windowEnd })
      .andWhere(
        `b.scheduled_at + (dur.duration_minutes || ' minutes')::interval > :windowStart`,
        { windowStart: scheduledAt },
      )
      .getOne();

    if (overlapping) {
      throw new BookingProviderDoubleBookedError(
        'Este proveedor ya tiene un servicio confirmado en ese horario.',
      );
    }
  }
}
