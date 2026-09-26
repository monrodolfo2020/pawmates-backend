import {
  BookingCannotCancelInProgressError,
  BookingInvalidTransitionError,
  Money,
} from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { BookingLine } from './booking-line.entity';
import { CancellationRecord } from './cancellation-record.entity';
import { PriceBreakdown } from './price-breakdown.entity';
import { RescheduleRequest } from './reschedule-request.entity';
import { BookingStatus, canTransition } from '../value-objects/booking-status';

/**
 * Booking — the aggregate root (Domain Model doc §10). Behavior lives on
 * the entity itself (rich domain model over TypeORM) so an invalid state
 * transition is a compile-time-adjacent guarantee, not something callers
 * have to remember to check.
 *
 * Cross-aggregate rules that need a database query across sibling rows
 * (Policy P-14 / P-17, no double booking) live in
 * domain/policies/no-double-booking.policy.ts, not here — an entity
 * method never queries the database.
 */
@Entity({ name: 'booking_bookings' })
export class Booking {
  // A ULID (see static request() below): globally unique and ordered by
  // creation time, stored as text. The table's primary key.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'owner_id', type: 'text' })
  ownerId!: string;

  @Column({ name: 'provider_id', type: 'text' })
  providerId!: string;

  @Column({ type: 'text' })
  status!: BookingStatus;

  @Column({ name: 'recurrence_series_id', type: 'text', nullable: true })
  recurrenceSeriesId!: string | null;

  @Column({ name: 'scheduled_at', type: 'datetime' })
  scheduledAt!: Date;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  // Set by start()/complete() below — the Report Card's duration is
  // completedAt - startedAt, not derived from updatedAt (which every
  // status transition bumps, not just these two).
  @Column({ name: 'started_at', type: 'datetime', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  // Chat read state (per-account, not per-device — see BookingController's
  // sendMessage/listMessages, the only writers of these three columns).
  @Column({ name: 'last_message_at', type: 'datetime', nullable: true })
  lastMessageAt!: Date | null;

  @Column({ name: 'owner_last_read_at', type: 'datetime', nullable: true })
  ownerLastReadAt!: Date | null;

  @Column({ name: 'provider_last_read_at', type: 'datetime', nullable: true })
  providerLastReadAt!: Date | null;

  @OneToMany(() => BookingLine, (line) => line.booking, { cascade: true })
  lines!: BookingLine[];

  @OneToMany(() => CancellationRecord, (r) => r.booking)
  cancellationRecords!: CancellationRecord[];

  @OneToMany(() => RescheduleRequest, (r) => r.booking)
  rescheduleRequests!: RescheduleRequest[];

  @OneToOne(() => PriceBreakdown, (pb) => pb.booking, { cascade: true })
  priceBreakdown!: PriceBreakdown;

  static request(params: {
    ownerId: string;
    providerId: string;
    scheduledAt: Date;
    idempotencyKey: string;
    lines: Array<{
      petId: string;
      serviceTypeCode: string;
      durationValue: number;
      durationUnit: 'min' | 'hour' | 'day';
      addressId: string;
      serviceId?: string | null;
      serviceName?: string | null;
    }>;
    recurrenceSeriesId?: string;
  }): Booking {
    const booking = new Booking();
    booking.id = ulid().toLowerCase();
    booking.ownerId = params.ownerId;
    booking.providerId = params.providerId;
    booking.scheduledAt = params.scheduledAt;
    booking.idempotencyKey = params.idempotencyKey;
    booking.recurrenceSeriesId = params.recurrenceSeriesId ?? null;
    booking.status = BookingStatus.Requested;
    booking.startedAt = null;
    booking.completedAt = null;
    booking.lines = params.lines.map((line) => {
      const l = new BookingLine();
      Object.assign(l, { serviceId: null, serviceName: null }, line);
      return l;
    });
    return booking;
  }

  private transitionTo(next: BookingStatus): void {
    if (!canTransition(this.status, next)) {
      throw new BookingInvalidTransitionError(
        TRANSITION_MESSAGES[next] ??
          'Esta reserva no puede cambiar a ese estado.',
      );
    }
    this.status = next;
  }

  accept(): void {
    this.transitionTo(BookingStatus.Accepted);
  }

  confirm(priceBreakdown: PriceBreakdown): void {
    this.transitionTo(BookingStatus.Confirmed);
    this.priceBreakdown = priceBreakdown;
  }

  start(): void {
    this.transitionTo(BookingStatus.InProgress);
    this.startedAt = new Date();
  }

  complete(): void {
    this.transitionTo(BookingStatus.Completed);
    this.completedAt = new Date();
  }

  /** Policy P-15: no cancelling once the service is in progress. */
  cancel(
    cancelledBy: string,
    reason: string | null,
    penalty: Money,
  ): CancellationRecord {
    if (this.status === BookingStatus.InProgress) {
      throw new BookingCannotCancelInProgressError(
        'No puedes cancelar un paseo que ya comenzó.',
      );
    }
    this.transitionTo(BookingStatus.Cancelled);
    const record = new CancellationRecord();
    record.bookingId = this.id;
    record.cancelledBy = cancelledBy;
    record.reason = reason;
    record.penaltyAmount = penalty.amount;
    record.penaltyCurrency = penalty.currency;
    return record;
  }

  requestReschedule(
    proposedStart: Date,
    requestedBy: string,
  ): RescheduleRequest {
    const request = new RescheduleRequest();
    request.bookingId = this.id;
    request.proposedStart = proposedStart;
    request.requestedBy = requestedBy;
    request.status = 'pending';
    return request;
  }

  get rateAmount(): Money {
    return Money.of(
      this.priceBreakdown.rateAmount,
      this.priceBreakdown.currency,
    );
  }
}

/** What the person sees when a transition is refused, keyed by what
 * they were trying to do. */
const TRANSITION_MESSAGES: Partial<Record<BookingStatus, string>> = {
  [BookingStatus.InProgress]:
    'Solo se puede iniciar un paseo confirmado que no haya empezado.',
  [BookingStatus.Completed]:
    'Solo se puede terminar un paseo que está en curso.',
  [BookingStatus.Confirmed]: 'Esta solicitud ya no está pendiente.',
  [BookingStatus.Cancelled]: 'Esta reserva ya no se puede cancelar.',
};
