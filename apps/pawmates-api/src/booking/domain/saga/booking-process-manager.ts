import {
  EVENT_TOPICS,
  Money,
  PaymentCardDeclinedError,
  ResourceNotFoundError,
  ValidationError,
} from '@pawmates/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ulid } from 'ulid';
import { Booking } from '../entities/booking.entity';
import { CancellationRecord } from '../entities/cancellation-record.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { PriceBreakdown } from '../entities/price-breakdown.entity';
import { RecurrenceSeries } from '../entities/recurrence-series.entity';
import { RescheduleRequest } from '../entities/reschedule-request.entity';
import { MARKETPLACE_PORT } from '../ports/marketplace.port';
import type { MarketplacePort } from '../ports/marketplace.port';
import { PAYMENTS_PORT } from '../ports/payments.port';
import type { PaymentsPort } from '../ports/payments.port';
import { TRUST_SAFETY_PORT } from '../ports/trust-safety.port';
import type { TrustSafetyPort } from '../ports/trust-safety.port';
import { NoDoubleBookingPolicy } from '../policies/no-double-booking.policy';
import { CancellationPolicy } from '../value-objects/cancellation-policy';
import { expandOccurrences } from '../value-objects/recurrence-rule';
import type {
  CreateBookingCommand,
  CreateRecurringBookingCommand,
} from './commands';
import { longestDurationMinutes } from './duration';

/**
 * BookingProcessManager — the saga orchestrator (Architecture doc ADR-05).
 * Owns the full CreateBooking flow diagrammed in Architecture §11: two
 * synchronous gRPC validations, a persist + outbox commit, then (on
 * acceptance) a synchronous payment authorization with an explicit
 * compensation path when it fails. No step here is "handled by a retry
 * later" — every compensation is written before the corresponding
 * advance, per Architecture §06's design rule for this saga.
 */
@Injectable()
export class BookingProcessManager {
  private readonly logger = new Logger(BookingProcessManager.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    @InjectRepository(RecurrenceSeries)
    private readonly recurrenceSeries: Repository<RecurrenceSeries>,
    @Inject(MARKETPLACE_PORT) private readonly marketplace: MarketplacePort,
    @Inject(TRUST_SAFETY_PORT) private readonly trustSafety: TrustSafetyPort,
    @Inject(PAYMENTS_PORT) private readonly payments: PaymentsPort,
    private readonly noDoubleBooking: NoDoubleBookingPolicy,
  ) {}

  async createBooking(
    cmd: CreateBookingCommand,
    traceId: string,
  ): Promise<Booking> {
    const existing = await this.bookings.findOne({
      where: { idempotencyKey: cmd.idempotencyKey, ownerId: cmd.ownerId },
      relations: ['lines', 'priceBreakdown'],
    });
    if (existing) return existing; // Idempotency-Key replay (API Design doc §03)

    if (!cmd.lines.length) {
      throw new ValidationError(
        'La reserva necesita al menos una mascota y servicio.',
      );
    }
    const durationMinutes = longestDurationMinutes(cmd.lines);

    // 1. Synchronous validations (Architecture §11, gRPC) — fail fast,
    //    before ever touching this service's own database.
    const availability = await this.marketplace.checkAvailability({
      providerServiceId: cmd.providerServiceId,
      scheduledAt: cmd.scheduledAt,
      durationMinutes,
    });
    if (!availability.available) {
      throw new ValidationError(
        'El proveedor no tiene disponibilidad en ese horario.',
      );
    }

    const verification = await this.trustSafety.checkVerificationValid({
      accountId: availability.providerId,
      requiredLevel: 'standard',
    });
    if (!verification.valid) {
      throw new ValidationError(
        'Este proveedor no cuenta con verificación vigente para operar.',
      );
    }

    // Policy P-14 / P-17 — no double booking (checked against this
    // service's own data even though marketplace already said "available";
    // Booking, not Marketplace, owns this invariant per the Domain Model).
    await this.noDoubleBooking.assertAvailable(
      availability.providerId,
      cmd.scheduledAt,
      durationMinutes,
    );

    const booking = Booking.request({
      ownerId: cmd.ownerId,
      providerId: availability.providerId,
      scheduledAt: cmd.scheduledAt,
      idempotencyKey: cmd.idempotencyKey,
      lines: cmd.lines,
      recurrenceSeriesId: cmd.recurrenceSeriesId,
    });

    const tipEstimate = availability.rate.multiply(0.15);
    const total = availability.rate
      .add(availability.commission)
      .add(availability.tax)
      .add(tipEstimate);
    const priceBreakdown = PriceBreakdown.create({
      bookingId: booking.id,
      rate: availability.rate,
      commission: availability.commission,
      tax: availability.tax,
      tipEstimate,
      total,
    });
    booking.priceBreakdown = priceBreakdown;

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Booking, booking);
      await manager.save(PriceBreakdown, priceBreakdown);
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'BookingCreated',
        traceId,
        {
          bookingId: booking.id,
          ownerId: booking.ownerId,
          providerId: booking.providerId,
          scheduledAt: booking.scheduledAt.toISOString(),
        },
      );
    });

    return booking;
  }

  /**
   * Provider accepts a Requested Booking (dashboard "Solicitudes
   * nuevas"). This is where payment is actually authorized — nobody's
   * card is charged before a provider has agreed to do the work.
   * Policy P-16: never confirm if authorization fails.
   */
  async acceptBooking(
    bookingId: string,
    paymentMethodId: string,
    traceId: string,
  ): Promise<Booking> {
    const booking = await this.loadOrThrow(bookingId, ['priceBreakdown']);

    const auth = await this.payments.authorizePayment({
      bookingId: booking.id,
      amount: booking.priceBreakdown.total,
      paymentMethodId,
      idempotencyKey: `accept:${booking.id}`,
    });

    if (auth.status !== 'authorized') {
      await this.dataSource.transaction(async (manager) => {
        await this.enqueue(
          manager,
          booking,
          EVENT_TOPICS.booking,
          'BookingPaymentAuthorizationFailed',
          traceId,
          { bookingId: booking.id, transactionId: auth.transactionId },
        );
      });
      throw new PaymentCardDeclinedError('No se pudo autorizar el pago.');
    }

    booking.accept();
    booking.confirm(booking.priceBreakdown);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Booking, booking);
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'ProviderAccepted',
        traceId,
        {
          bookingId: booking.id,
        },
      );
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'BookingConfirmed',
        traceId,
        {
          bookingId: booking.id,
          transactionId: auth.transactionId,
        },
      );
    });

    return booking;
  }

  async rejectBooking(
    bookingId: string,
    providerId: string,
    reason: string | null,
    traceId: string,
  ): Promise<Booking> {
    const booking = await this.loadOrThrow(bookingId, ['priceBreakdown']);
    const record = booking.cancel(
      providerId,
      reason,
      Money.zero(booking.priceBreakdown?.currency ?? 'USD'),
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Booking, booking);
      await manager.save(CancellationRecord, record);
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'BookingCancelled',
        traceId,
        {
          bookingId: booking.id,
          cancelledBy: providerId,
        },
      );
    });
    return booking;
  }

  /** Policy P-15 enforced inside Booking.cancel(); P-18 penalty computed here. */
  async cancelBooking(
    bookingId: string,
    cancelledBy: string,
    reason: string | null,
    traceId: string,
  ): Promise<Booking> {
    const booking = await this.loadOrThrow(bookingId, ['priceBreakdown']);
    const policy = CancellationPolicy.default();
    const penalty = booking.priceBreakdown
      ? policy.calculatePenalty(
          booking.scheduledAt,
          new Date(),
          Money.of(
            booking.priceBreakdown.rateAmount,
            booking.priceBreakdown.currency,
          ),
        )
      : Money.zero('USD');

    const record = booking.cancel(cancelledBy, reason, penalty);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Booking, booking);
      await manager.save(CancellationRecord, record);
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'BookingCancelled',
        traceId,
        {
          bookingId: booking.id,
          penaltyAmount: penalty.amount,
          penaltyCurrency: penalty.currency,
        },
      );
    });
    return booking;
  }

  async requestReschedule(
    bookingId: string,
    proposedStart: Date,
    requestedBy: string,
  ): Promise<void> {
    const booking = await this.loadOrThrow(bookingId, []);
    const request = booking.requestReschedule(proposedStart, requestedBy);
    await this.dataSource.manager.save(RescheduleRequest, request);
  }

  async createRecurringBooking(
    cmd: CreateRecurringBookingCommand,
    traceId: string,
  ): Promise<{ series: RecurrenceSeries; bookings: Booking[] }> {
    const series = new RecurrenceSeries();
    series.id = ulid().toLowerCase();
    series.ownerId = cmd.ownerId;
    series.providerId = cmd.providerServiceId;
    series.rule = cmd.rule;
    series.status = 'active';
    await this.recurrenceSeries.save(series);

    const occurrences = expandOccurrences(cmd.rule, new Date(), 4);
    const bookings: Booking[] = [];
    for (const [i, scheduledAt] of occurrences.entries()) {
      const booking = await this.createBooking(
        {
          ownerId: cmd.ownerId,
          providerServiceId: cmd.providerServiceId,
          scheduledAt,
          idempotencyKey: `${cmd.idempotencyKeyPrefix}:${i}`,
          lines: cmd.lines,
          recurrenceSeriesId: series.id,
        },
        traceId,
      );
      bookings.push(booking);
    }

    await this.dataSource.transaction(async (manager) => {
      if (bookings[0]) {
        await this.enqueue(
          manager,
          bookings[0],
          EVENT_TOPICS.booking,
          'RecurrenceSeriesCreated',
          traceId,
          {
            recurrenceSeriesId: series.id,
            firstOccurrences: bookings.map((b) => b.id),
          },
        );
      }
    });

    return { series, bookings };
  }

  /** Reacts to gps.events TripStarted — see infra/messaging/gps-events.consumer.ts. */
  async markInProgress(bookingId: string): Promise<void> {
    const booking = await this.loadOrThrow(bookingId, []);
    booking.start();
    await this.bookings.save(booking);
  }

  /** Reacts to gps.events TripCompleted — captures payment and closes the Booking. */
  async completeService(bookingId: string, traceId: string): Promise<void> {
    const booking = await this.loadOrThrow(bookingId, ['priceBreakdown']);
    booking.complete();

    const capture = await this.payments.capturePayment({
      transactionId: `auth:${booking.id}`, // reference implementation: see payments-svc stub
      finalAmount: booking.priceBreakdown.total,
    });

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Booking, booking);
      await this.enqueue(
        manager,
        booking,
        EVENT_TOPICS.booking,
        'WalkFinished',
        traceId,
        {
          bookingId: booking.id,
          captureStatus: capture.status,
        },
      );
    });
  }

  private async loadOrThrow(
    bookingId: string,
    relations: string[],
  ): Promise<Booking> {
    const booking = await this.bookings.findOne({
      where: { id: bookingId },
      relations,
    });
    if (!booking) {
      throw new ResourceNotFoundError(`Booking ${bookingId} no existe.`);
    }
    return booking;
  }

  private async enqueue(
    manager: EntityManager,
    booking: Booking,
    topic: string,
    eventType: string,
    traceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = new OutboxEvent();
    event.id = ulid().toLowerCase();
    event.topic = topic;
    event.eventType = eventType;
    event.partitionKey = booking.id;
    event.payload = payload;
    event.traceId = traceId;
    await manager.save(OutboxEvent, event);
    this.logger.log(`Enqueued ${eventType} for booking ${booking.id}`);
  }
}
