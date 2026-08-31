import { BookingCannotCancelInProgressError, Money } from '@pawmates/common';
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
  // The migration declares the real DB primary key as the composite
  // (id, scheduled_at) — required by Postgres for a table partitioned by
  // range on scheduled_at (Data Model doc §13). `id` (a ULID) is globally
  // unique on its own, so the entity models it as the sole logical key;
  // every query here already goes through `id`, which the composite PK's
  // leading column keeps indexed.
  // A ULID (see static request() below), not an RFC-4122 UUID — Postgres's
  // `uuid` type rejects ULID's Crockford base32 encoding, so this column
  // is `text` even though it's still globally unique and time-ordered.
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

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

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
    booking.lines = params.lines.map((line) => {
      const l = new BookingLine();
      Object.assign(l, line);
      return l;
    });
    return booking;
  }

  private transitionTo(next: BookingStatus): void {
    if (!canTransition(this.status, next)) {
      throw new Error(
        `Invalid Booking transition: ${this.status} -> ${next} (id=${this.id})`,
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
  }

  complete(): void {
    this.transitionTo(BookingStatus.Completed);
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
