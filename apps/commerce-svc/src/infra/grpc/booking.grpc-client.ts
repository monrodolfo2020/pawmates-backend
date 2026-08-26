import type { BookingServiceClient } from '@pawmates/proto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { BookingPort } from '../../domain/ports/booking.port';

export const BOOKING_GRPC_CLIENT = Symbol('BOOKING_GRPC_CLIENT');

@Injectable()
export class BookingGrpcClient implements BookingPort, OnModuleInit {
  private service!: BookingServiceClient;

  constructor(
    @Inject(BOOKING_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.service =
      this.client.getService<BookingServiceClient>('BookingService');
  }

  async getUpcomingConfirmedBooking(params: {
    ownerId: string;
    providerId: string;
  }): Promise<{
    found: boolean;
    bookingId: string;
    scheduledAt: Date | null;
  }> {
    const res = await firstValueFrom(
      this.service.getUpcomingConfirmedBooking({
        ownerId: params.ownerId,
        providerId: params.providerId,
      }),
    );
    return {
      found: res.found,
      bookingId: res.bookingId,
      scheduledAt: res.scheduledAt ? new Date(res.scheduledAt) : null,
    };
  }
}
