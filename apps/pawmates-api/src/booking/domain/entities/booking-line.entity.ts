import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Booking } from './booking.entity';

/**
 * BookingLine (Data Model doc §07). One row per (pet, serviceType)
 * within a Booking — this is what makes multi-mascota / multi-servicio
 * reservations possible without a wider Booking table.
 */
@Entity({ name: 'booking_booking_lines' })
export class BookingLine {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Matches Booking.id's type — a ULID stored as `text`, not `uuid`.
  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @ManyToOne(() => Booking, (booking) => booking.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'booking_id' })
  booking!: Booking;

  @Column({ name: 'pet_id', type: 'text' })
  petId!: string;

  @Column({ name: 'service_type_code', type: 'text' })
  serviceTypeCode!: string;

  @Column({ name: 'duration_value', type: 'int' })
  durationValue!: number;

  @Column({ name: 'duration_unit', type: 'text' })
  durationUnit!: 'min' | 'hour' | 'day';

  @Column({ name: 'address_id', type: 'text' })
  addressId!: string;
}
