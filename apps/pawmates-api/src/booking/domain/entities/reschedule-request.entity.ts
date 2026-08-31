import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Booking } from './booking.entity';

@Entity({ name: 'booking_reschedule_requests' })
export class RescheduleRequest {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Matches Booking.id's type — a ULID stored as `text`, not `uuid`.
  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.rescheduleRequests, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'proposed_start', type: 'datetime' })
  proposedStart!: Date;

  @Column({ name: 'requested_by', type: 'text' })
  requestedBy!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: 'pending' | 'accepted' | 'rejected';

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
