import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintTransformer } from './bigint.transformer';
import { Booking } from './booking.entity';

/**
 * CancellationRecord (Data Model doc §07). Append-only — Convención 05:
 * a reschedule never rewrites this, it creates a new linked Booking.
 */
@Entity({ name: 'booking_cancellation_records' })
export class CancellationRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Matches Booking.id's type — a ULID stored as `text`, not `uuid`.
  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.cancellationRecords, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'cancelled_by', type: 'text' })
  cancelledBy!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({
    name: 'penalty_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  penaltyAmount!: number;

  @Column({ name: 'penalty_currency', type: 'text' })
  penaltyCurrency!: string;

  @CreateDateColumn({ name: 'cancelled_at', type: 'datetime' })
  cancelledAt!: Date;
}
