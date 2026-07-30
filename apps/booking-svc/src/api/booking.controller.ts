import {
  CurrentAccount,
  IdempotencyInterceptor,
  JwtAuthGuard,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ulid } from 'ulid';
import { Repository } from 'typeorm';
import { Booking } from '../domain/entities/booking.entity';
import { BookingProcessManager } from '../domain/saga/booking-process-manager';
import type { RecurrenceRule } from '../domain/value-objects/recurrence-rule';
import {
  AcceptBookingDto,
  CancelBookingDto,
  RejectBookingDto,
  RescheduleBookingDto,
} from './dto/booking-actions.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateRecurringBookingDto } from './dto/create-recurring-booking.dto';

/** Mirrors API Design doc §04 (owner-bff) and §05 (provider-bff) Booking endpoints. */
@Controller('v1/bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(
    private readonly processManager: BookingProcessManager,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
  ) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  async create(
    @Body() dto: CreateBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const booking = await this.processManager.createBooking(
      {
        ownerId: account.accountId,
        providerServiceId: dto.providerServiceId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : new Date(),
        idempotencyKey,
        lines: dto.lines,
      },
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toBookingResponse(booking) };
  }

  @Post('recurring')
  async createRecurring(
    @Body() dto: CreateRecurringBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const { series, bookings } =
      await this.processManager.createRecurringBooking(
        {
          ownerId: account.accountId,
          providerServiceId: dto.providerServiceId,
          lines: dto.lines,
          // The DTO validates shape only; the discriminated union itself
          // (date vs. count end condition) is a domain-layer concept the
          // wire format doesn't need to encode as two DTO subclasses.
          rule: dto.recurrenceRule as unknown as RecurrenceRule,
          idempotencyKeyPrefix: idempotencyKey ?? ulid().toLowerCase(),
        },
        traceId ?? ulid().toLowerCase(),
      );
    return {
      data: {
        recurrenceSeriesId: series.id,
        bookings: bookings.map(toBookingResponse),
      },
    };
  }

  @Get()
  async list(
    @CurrentAccount() account: AuthenticatedAccount,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ) {
    const qb = this.bookings
      .createQueryBuilder('b')
      .where(
        account.activeContext === 'owner'
          ? 'b.owner_id = :accountId'
          : 'b.provider_id = :accountId',
        { accountId: account.accountId },
      )
      .orderBy('b.scheduled_at', 'DESC')
      .take(Math.min(Number(limit) || 20, 100));

    if (status) qb.andWhere('b.status = :status', { status });
    if (cursor)
      qb.andWhere('b.id < :cursor', {
        cursor: Buffer.from(cursor, 'base64').toString(),
      });

    const rows = await qb.getMany();
    const nextCursor =
      rows.length > 0
        ? Buffer.from(rows[rows.length - 1].id).toString('base64')
        : null;

    return { data: rows.map(toBookingResponse), meta: { cursor: nextCursor } };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const booking = await this.bookings.findOneOrFail({
      where: { id },
      relations: ['lines', 'priceBreakdown'],
    });
    return { data: toBookingResponse(booking) };
  }

  @Post(':id/accept')
  async accept(
    @Param('id') id: string,
    @Body() dto: AcceptBookingDto,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const booking = await this.processManager.acceptBooking(
      id,
      dto.paymentMethodId,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toBookingResponse(booking) };
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const booking = await this.processManager.rejectBooking(
      id,
      account.accountId,
      dto.reason ?? null,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toBookingResponse(booking) };
  }

  @Post(':id/cancel')
  @UseInterceptors(IdempotencyInterceptor)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const booking = await this.processManager.cancelBooking(
      id,
      account.accountId,
      dto.reason ?? null,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toBookingResponse(booking) };
  }

  @Post(':id/reschedule')
  async reschedule(
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    await this.processManager.requestReschedule(
      id,
      new Date(dto.proposedStart),
      account.accountId,
    );
    return { data: { status: 'pending' } };
  }
}

function toBookingResponse(booking: Booking) {
  return {
    id: booking.id,
    ownerId: booking.ownerId,
    providerId: booking.providerId,
    status: booking.status,
    scheduledAt: booking.scheduledAt,
    lines: booking.lines,
    priceBreakdown: booking.priceBreakdown
      ? {
          rateAmount: booking.priceBreakdown.rateAmount,
          commissionAmount: booking.priceBreakdown.commissionAmount,
          taxAmount: booking.priceBreakdown.taxAmount,
          tipEstimate: booking.priceBreakdown.tipEstimate,
          totalAmount: booking.priceBreakdown.totalAmount,
          currency: booking.priceBreakdown.currency,
        }
      : null,
  };
}
