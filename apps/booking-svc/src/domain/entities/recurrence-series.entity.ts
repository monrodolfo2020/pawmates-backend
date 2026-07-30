import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { RecurrenceRule } from '../value-objects/recurrence-rule';

/**
 * RecurrenceSeries (Domain Model doc §10). Generates individual Booking
 * rows via RecurrenceExpansionService; pausing/ending the series never
 * retroactively touches Booking rows already generated.
 */
@Entity({ name: 'recurrence_series', schema: 'booking' })
export class RecurrenceSeries {
  // App-assigned ULID (see BookingProcessManager.createRecurringBooking),
  // not DB-generated — hence a plain @PrimaryColumn, not
  // @PrimaryGeneratedColumn, and `text` rather than `uuid`.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @Column({ type: 'jsonb' })
  rule!: RecurrenceRule;

  @Column({ type: 'text', default: 'active' })
  status!: 'active' | 'paused' | 'ended';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
