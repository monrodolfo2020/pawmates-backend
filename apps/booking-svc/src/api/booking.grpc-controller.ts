import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  GetUpcomingConfirmedBookingRequest,
  GetUpcomingConfirmedBookingResponse,
} from '@pawmates/proto';
import { In, MoreThan, Repository } from 'typeorm';
import { Booking } from '../domain/entities/booking.entity';
import { BookingStatus } from '../domain/value-objects/booking-status';

/**
 * booking-svc's one inbound gRPC method (booking.proto) — everywhere else
 * it's only a gRPC *client*. Added for commerce-svc's
 * RequiresUpcomingBookingPolicy (PawMates Commerce, Prompt 5 follow-up):
 * a storefront Order can only be linked for "deliver on the next walk"
 * once there's a confirmed, still-future Booking between that owner and
 * that provider.
 */
@Controller()
export class BookingGrpcController {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
  ) {}

  @GrpcMethod('BookingService', 'GetUpcomingConfirmedBooking')
  async getUpcomingConfirmedBooking(
    data: GetUpcomingConfirmedBookingRequest,
  ): Promise<GetUpcomingConfirmedBookingResponse> {
    const booking = await this.bookings.findOne({
      where: {
        ownerId: data.ownerId,
        providerId: data.providerId,
        status: In([BookingStatus.Accepted, BookingStatus.Confirmed]),
        scheduledAt: MoreThan(new Date()),
      },
      order: { scheduledAt: 'ASC' },
    });

    if (!booking) {
      return { found: false, bookingId: '', scheduledAt: '' };
    }
    return {
      found: true,
      bookingId: booking.id,
      scheduledAt: booking.scheduledAt.toISOString(),
    };
  }
}
