import { ValidationError } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';

export const MIN_RATING = 1;
export const MAX_RATING = 5;
const MAX_COMMENT_LENGTH = 1000;

/**
 * An owner's review of a business: a rating in bones (1 to 5, the app
 * draws huesitos instead of stars) and an optional comment.
 *
 * A bookable business (a walker) is reviewed per booking — `bookingId`
 * set, one review per booking — so only owners it actually served can
 * rate it. The rest are contacted outside the app, so any owner with a
 * verified email may review them once — `bookingId` null, one review per
 * owner and business. Writing again edits the same review.
 */
@Entity({ name: 'providers_reviews' })
export class Review {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'provider_id', type: 'text' })
  providerId!: string;

  @Column({ name: 'owner_id', type: 'text' })
  ownerId!: string;

  @Column({ name: 'booking_id', type: 'text', nullable: true })
  bookingId!: string | null;

  @Column({ type: 'integer' })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  /** The business's public answer, shown under the review. One per
   * review; writing again replaces it, and an empty one removes it. */
  @Column({ type: 'text', nullable: true })
  reply!: string | null;

  @Column({ name: 'reply_at', type: 'datetime', nullable: true })
  replyAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  static write(params: {
    providerId: string;
    ownerId: string;
    bookingId: string | null;
    rating: number;
    comment?: string | null;
  }): Review {
    const review = new Review();
    review.id = ulid().toLowerCase();
    review.providerId = params.providerId;
    review.ownerId = params.ownerId;
    review.bookingId = params.bookingId;
    review.edit(params.rating, params.comment ?? null);
    return review;
  }

  edit(rating: number, comment: string | null): void {
    if (
      !Number.isInteger(rating) ||
      rating < MIN_RATING ||
      rating > MAX_RATING
    ) {
      throw new ValidationError(
        `La calificación va de ${MIN_RATING} a ${MAX_RATING} huesitos.`,
      );
    }
    const trimmed = comment?.trim() ?? '';
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      throw new ValidationError(
        `La reseña puede tener hasta ${MAX_COMMENT_LENGTH} caracteres.`,
      );
    }
    this.rating = rating;
    this.comment = trimmed === '' ? null : trimmed;
  }

  respond(text: string | null, now: Date = new Date()): void {
    const trimmed = text?.trim() ?? '';
    if (trimmed.length > MAX_COMMENT_LENGTH) {
      throw new ValidationError(
        `La respuesta puede tener hasta ${MAX_COMMENT_LENGTH} caracteres.`,
      );
    }
    this.reply = trimmed === '' ? null : trimmed;
    this.replyAt = this.reply === null ? null : now;
  }
}
