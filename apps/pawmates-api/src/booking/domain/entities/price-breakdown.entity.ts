import { Money } from '@pawmates/common';
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { Booking } from './booking.entity';
import { bigintTransformer } from './bigint.transformer';

/**
 * PriceBreakdown (Data Model doc §07, table booking.price_breakdowns).
 * Frozen at creation time — never recalculated if the provider's
 * RateCard changes afterward (Domain Model doc §10: "el precio
 * reservado es el precio pagado").
 */
@Entity({ name: 'booking_price_breakdowns' })
export class PriceBreakdown {
  // Matches Booking.id's type — a ULID stored as `text`, not `uuid`.
  @PrimaryColumn('text', { name: 'booking_id' })
  bookingId!: string;

  @OneToOne(() => Booking, (booking) => booking.priceBreakdown, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({
    name: 'rate_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  rateAmount!: number;

  @Column({
    name: 'commission_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  commissionAmount!: number;

  @Column({
    name: 'tax_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  taxAmount!: number;

  @Column({
    name: 'tip_estimate',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  tipEstimate!: number;

  @Column({
    name: 'total_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  totalAmount!: number;

  @Column({ type: 'text' })
  currency!: string;

  get total(): Money {
    return Money.of(this.totalAmount, this.currency);
  }

  static create(params: {
    bookingId: string;
    rate: Money;
    commission: Money;
    tax: Money;
    tipEstimate: Money;
    total: Money;
  }): PriceBreakdown {
    const pb = new PriceBreakdown();
    pb.bookingId = params.bookingId;
    pb.rateAmount = params.rate.amount;
    pb.commissionAmount = params.commission.amount;
    pb.taxAmount = params.tax.amount;
    pb.tipEstimate = params.tipEstimate.amount;
    pb.totalAmount = params.total.amount;
    pb.currency = params.total.currency;
    return pb;
  }
}
