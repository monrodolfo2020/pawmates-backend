import { Column, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

/**
 * One GPS ping during a walk (Booking's live-tracking Report Card
 * feature). Written by the walker's app roughly every few seconds while
 * a Booking is `in_progress`; read back as an ordered trail by
 * GET /v1/trips/:bookingId (see trips.controller.ts) both for the live
 * map (while in progress) and the finished route (once completed).
 */
@Entity({ name: 'booking_trip_locations' })
export class TripLocation {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'booking_id', type: 'text' })
  bookingId!: string;

  @Column({ type: 'real' })
  lat!: number;

  @Column({ type: 'real' })
  lng!: number;

  @Column({ name: 'recorded_at', type: 'datetime' })
  recordedAt!: Date;

  static record(bookingId: string, lat: number, lng: number, recordedAt: Date): TripLocation {
    const point = new TripLocation();
    point.id = ulid().toLowerCase();
    point.bookingId = bookingId;
    point.lat = lat;
    point.lng = lng;
    point.recordedAt = recordedAt;
    return point;
  }
}
