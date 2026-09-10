import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { In, MoreThan, Repository } from 'typeorm';
import { Booking } from '../../../booking/domain/entities/booking.entity';
import { BookingStatus } from '../../../booking/domain/value-objects/booking-status';
import type { BookingPort } from '../../domain/ports/booking.port';

/**
 * RequiresUpcomingBookingPolicy's one real (not faked) external dependency:
 * consolidating booking and commerce into one deployable means this no
 * longer needs a gRPC hop — it queries Booking's own repository directly,
 * same query the old cross-service BookingGrpcController ran.
 */
@Injectable()
export class InProcessBookingAdapter implements BookingPort {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
  ) {}

  async getUpcomingConfirmedBooking(params: {
    ownerId: string;
  }): Promise<{
    found: boolean;
    bookingId: string;
    providerId: string;
    scheduledAt: Date | null;
  }> {
    const booking = await this.bookings.findOne({
      where: {
        ownerId: params.ownerId,
        status: In([BookingStatus.Accepted, BookingStatus.Confirmed]),
        scheduledAt: MoreThan(new Date()),
      },
      order: { scheduledAt: 'ASC' },
    });

    if (!booking) {
      return { found: false, bookingId: '', providerId: '', scheduledAt: null };
    }
    return {
      found: true,
      bookingId: booking.id,
      providerId: booking.providerId,
      scheduledAt: booking.scheduledAt,
    };
  }
}
