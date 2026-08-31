import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

export type WalkEventType = 'photo' | 'pee' | 'poop';

/**
 * A moment the walker logs mid-walk — a photo, or a pee/poop mark — for
 * the post-walk Report Card (see trips.controller.ts's
 * GET /v1/trips/:bookingId, which assembles the card from these plus
 * TripLocation's route). Photos are base64, same tradeoff as pet/ID
 * photos elsewhere in this app (see README's Identity section) — no
 * video for this MVP, base64 video would bloat every row.
 */
@Entity({ name: 'booking_walk_events' })
export class WalkEvent {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @Column({ type: 'text' })
  type!: WalkEventType;

  @Column({ name: 'photo_base64', type: 'text', nullable: true })
  photoBase64!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ type: 'real', nullable: true })
  lat!: number | null;

  @Column({ type: 'real', nullable: true })
  lng!: number | null;

  @Column({ name: 'recorded_at', type: 'datetime' })
  recordedAt!: Date;

  static log(params: {
    bookingId: string;
    type: WalkEventType;
    photoBase64?: string | null;
    note?: string | null;
    lat?: number | null;
    lng?: number | null;
    recordedAt: Date;
  }): WalkEvent {
    const event = new WalkEvent();
    event.id = ulid().toLowerCase();
    event.bookingId = params.bookingId;
    event.type = params.type;
    event.photoBase64 = params.photoBase64 ?? null;
    event.note = params.note ?? null;
    event.lat = params.lat ?? null;
    event.lng = params.lng ?? null;
    event.recordedAt = params.recordedAt;
    return event;
  }
}
