import {
  CurrentAccount,
  IdempotencyInterceptor,
  JwtAuthGuard,
  RoleRequiredError,
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
import { Between, In, Repository } from 'typeorm';
import { Booking } from '../domain/entities/booking.entity';
import { BookingMessage } from '../domain/entities/booking-message.entity';
import { BookingProcessManager } from '../domain/saga/booking-process-manager';
import { Pet } from '../../identity/domain/entities/pet.entity';
import { Account } from '../../identity/domain/entities/account.entity';
import { BookingStatus } from '../domain/value-objects/booking-status';
import type { RecurrenceRule } from '../domain/value-objects/recurrence-rule';
import {
  AcceptBookingDto,
  CancelBookingDto,
  RejectBookingDto,
  RescheduleBookingDto,
} from './dto/booking-actions.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateRecurringBookingDto } from './dto/create-recurring-booking.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** Mirrors API Design doc §04 (owner-bff) and §05 (provider-bff) Booking endpoints. */
@Controller('v1/bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(
    private readonly processManager: BookingProcessManager,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(BookingMessage)
    private readonly messages: Repository<BookingMessage>,
    @InjectRepository(Pet) private readonly pets: Repository<Pet>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
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
        bookings: bookings.map((b) => toBookingResponse(b)),
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
      .leftJoinAndSelect('b.lines', 'lines')
      .leftJoinAndSelect('b.priceBreakdown', 'priceBreakdown')
      .where(
        account.activeContext === 'owner'
          ? 'b.owner_id = :accountId'
          : 'b.provider_id = :accountId',
        { accountId: account.accountId },
      )
      .orderBy('b.scheduledAt', 'DESC')
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

    const enrichment = await this.loadEnrichment(rows);
    return {
      data: rows.map((b) => toBookingResponse(b, enrichment)),
      meta: { cursor: nextCursor },
    };
  }

  /** Real "Ingresos esta semana" / "Esta semana" data for the paseador
   * Dashboard, replacing what used to be hardcoded mock numbers on the
   * frontend. Must come before the `:id` route below — otherwise Nest
   * would try to match "summary" as a booking id. */
  @Get('summary')
  async summary(@CurrentAccount() account: AuthenticatedAccount) {
    if (!account.roles.includes('provider')) {
      throw new RoleRequiredError('Esta acción requiere el rol de paseador.');
    }
    const weekStart = startOfWeekUTC(new Date());
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Earnings: what the paseador actually keeps (their rate + estimated
    // tip) from walks that finished this week — commission/tax are the
    // platform's/authorities' share, not theirs (see confirm()'s total =
    // rate + commission + tax + tipEstimate in BookingProcessManager).
    const completed = await this.bookings.find({
      where: {
        providerId: account.accountId,
        status: BookingStatus.Completed,
        completedAt: Between(weekStart, weekEnd),
      },
      relations: ['priceBreakdown'],
    });
    const earningsAmount = completed.reduce(
      (sum, b) => sum + (b.priceBreakdown ? b.priceBreakdown.rateAmount + b.priceBreakdown.tipEstimate : 0),
      0,
    );
    const currency = completed[0]?.priceBreakdown?.currency ?? 'MXN';

    // The week strip: how many walks land on each day, whether already
    // completed or still upcoming — 'requested' is excluded since that's
    // not a walk on the calendar yet, and 'cancelled'/'disputed' never were.
    const scheduled = await this.bookings.find({
      where: {
        providerId: account.accountId,
        status: In([BookingStatus.Confirmed, BookingStatus.InProgress, BookingStatus.Completed]),
        scheduledAt: Between(weekStart, weekEnd),
      },
    });
    const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
    const counts = new Array(7).fill(0) as number[];
    for (const b of scheduled) {
      const dayIndex = Math.floor((b.scheduledAt.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex >= 0 && dayIndex < 7) counts[dayIndex]++;
    }

    return {
      data: {
        weekStart: weekStart.toISOString(),
        earnings: { amount: earningsAmount, currency },
        completedThisWeek: completed.length,
        days: DAY_LABELS.map((label, i) => ({ label, count: counts[i] })),
      },
    };
  }

  @Get(':id')
  async getOne(@Param('id') id: string) {
    const booking = await this.bookings.findOneOrFail({
      where: { id },
      relations: ['lines', 'priceBreakdown'],
    });
    const enrichment = await this.loadEnrichment([booking]);
    return { data: toBookingResponse(booking, enrichment) };
  }

  /** Batch-loads the pet names and owner name this booking list needs to
   * render as more than bare ids (e.g. "Toby · Beagle" on the paseador's
   * Dashboard) — one query per entity, not N+1 per row. */
  private async loadEnrichment(
    rows: Booking[],
  ): Promise<{ petNames: Map<string, string>; ownerNames: Map<string, string | null> }> {
    const petIds = [...new Set(rows.flatMap((b) => b.lines?.map((l) => l.petId) ?? []))];
    const ownerIds = [...new Set(rows.map((b) => b.ownerId))];
    const [pets, owners]: [Pet[], Account[]] = await Promise.all([
      petIds.length ? this.pets.find({ where: { id: In(petIds) } }) : Promise.resolve([]),
      ownerIds.length ? this.accounts.find({ where: { id: In(ownerIds) } }) : Promise.resolve([]),
    ]);
    return {
      petNames: new Map(pets.map((p) => [p.id, `${p.name} · ${p.breed}`])),
      ownerNames: new Map(owners.map((o) => [o.id, o.name])),
    };
  }

  @Post(':id/accept')
  async accept(
    @Param('id') id: string,
    @Body() dto: AcceptBookingDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    await this.assertProviderOwnsBooking(id, account);
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
    await this.assertProviderOwnsBooking(id, account);
    const booking = await this.processManager.rejectBooking(
      id,
      account.accountId,
      dto.reason ?? null,
      traceId ?? ulid().toLowerCase(),
    );
    return { data: toBookingResponse(booking) };
  }

  /** accept/reject are the paseador deciding on a request addressed to
   * them — unlike list()/messages above (which key off activeContext,
   * see this controller's header comment on that looseness), a wrong or
   * malicious accountId here would let anyone confirm or cancel someone
   * else's booking, so this checks the booking's actual providerId. */
  private async assertProviderOwnsBooking(
    id: string,
    account: AuthenticatedAccount,
  ): Promise<void> {
    const booking = await this.bookings.findOneOrFail({ where: { id } });
    if (booking.providerId !== account.accountId) {
      throw new RoleRequiredError('Esta solicitud no te pertenece.');
    }
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

  /**
   * Owner/paseador chat thread for this Booking. Polled, not pushed — no
   * WebSocket gateway in this consolidated MVP, same reasoning as the
   * live-trip map polling GET /v1/trips/:id (see that controller).
   *
   * senderRole comes from activeContext (the same header/mode-toggle
   * `list()` above already keys off of), not a strict participant check
   * against this booking's own owner_id/provider_id — matching
   * accept/reject/cancel and the trip endpoints' existing looseness (see
   * TripsController's comment: that gap predates the real Marketplace
   * and is now meaningful to close, just not done in the same pass that
   * introduced it).
   */
  @Post(':id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const message = BookingMessage.send({
      bookingId: id,
      senderId: account.accountId,
      senderRole: account.activeContext,
      text: dto.text,
    });
    await this.messages.save(message);
    return { data: toMessageResponse(message) };
  }

  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const booking = await this.bookings.findOneOrFail({ where: { id } });
    if (
      booking.ownerId !== account.accountId &&
      booking.providerId !== account.accountId &&
      !account.roles.includes('admin')
    ) {
      throw new RoleRequiredError('No tienes acceso a esta conversación.');
    }
    const rows = await this.messages.find({
      where: { bookingId: id },
      order: { sentAt: 'ASC' },
    });
    return { data: rows.map(toMessageResponse) };
  }
}

// Monday 00:00 UTC of the week containing `d` — every scheduledAt/
// completedAt in this codebase is stored and compared in UTC (see
// BookingProcessManager defaulting scheduledAt to `new Date()`), so the
// week boundary follows the same convention rather than any one user's
// local timezone.
function startOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - diffToMonday));
}

function toMessageResponse(message: BookingMessage) {
  return {
    id: message.id,
    senderId: message.senderId,
    senderRole: message.senderRole,
    text: message.text,
    sentAt: message.sentAt,
  };
}

function toBookingResponse(
  booking: Booking,
  enrichment?: { petNames: Map<string, string>; ownerNames: Map<string, string | null> },
) {
  return {
    id: booking.id,
    ownerId: booking.ownerId,
    ownerName: enrichment?.ownerNames.get(booking.ownerId) ?? null,
    providerId: booking.providerId,
    status: booking.status,
    scheduledAt: booking.scheduledAt,
    lines: (booking.lines ?? []).map((line) => ({
      ...line,
      petName: enrichment?.petNames.get(line.petId) ?? null,
    })),
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
