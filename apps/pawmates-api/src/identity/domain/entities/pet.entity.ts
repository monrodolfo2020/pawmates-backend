import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Pet — belongs to one owner Account, an owner can have several. `id` is
 * a real `uuid` (not this repo's usual ULID) because Booking.petId was
 * already declared `uuid` before this entity existed (see
 * booking-line.entity.ts) — matching that, not the ULID convention,
 * avoids the exact "wrong column type for a cross-context id" bug this
 * codebase already hit once with Order.deliveryBookingId.
 */
@Entity({ name: 'pets', schema: 'identity' })
export class Pet {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  breed!: string;

  @Column({ type: 'text' })
  size!: string;

  @Column({ type: 'jsonb' })
  temperament!: string[];

  @Column({ type: 'jsonb' })
  vaccines!: string[];

  @Column({ name: 'photo_base64', type: 'text', nullable: true })
  photoBase64!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
