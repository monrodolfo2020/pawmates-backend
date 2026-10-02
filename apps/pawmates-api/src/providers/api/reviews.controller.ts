import {
  BookingNotEligibleForReviewError,
  CurrentAccount,
  JwtAuthGuard,
  ResourceNotFoundError,
  RoleRequiredError,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Account } from '../../identity/domain/entities/account.entity';
import { Booking } from '../../booking/domain/entities/booking.entity';
import { BookingStatus } from '../../booking/domain/value-objects/booking-status';
import {
  ProviderProfile,
  PUBLICLY_VISIBLE,
} from '../domain/entities/provider-profile.entity';
import { Review } from '../domain/entities/review.entity';
import { isBookable } from '../domain/value-objects/service-category';
import { WriteReviewDto } from './dto/write-review.dto';
import { ReplyReviewDto } from './dto/reply-review.dto';
import { loadRatings, publicRating } from './ratings';

/** A booking that took place: the business accepted it and its time has
 * come (or the walk was already started or finished in the app). */
const SERVED_STATUSES = [
  BookingStatus.Confirmed,
  BookingStatus.InProgress,
  BookingStatus.Completed,
];

/**
 * Owners' reviews of businesses, rated in bones (see Review for who may
 * review what). Reading a business's reviews is public, like its page.
 */
@Controller('v1')
export class ReviewsController {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
  ) {}

  @Get('providers/:accountId/reviews')
  async list(@Param('accountId') accountId: string) {
    const rows = await this.reviews.find({
      where: { providerId: accountId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const authors = rows.length
      ? await this.accounts.find({
          where: { id: In([...new Set(rows.map((r) => r.ownerId))]) },
        })
      : [];
    const nameOf = new Map(authors.map((a) => [a.id, a.name]));
    const rating = publicRating(
      (await loadRatings(this.reviews, [accountId])).get(accountId),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        authorName: shortName(nameOf.get(r.ownerId)),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        reply: r.reply,
        replyAt: r.replyAt,
      })),
      meta: { rating },
    };
  }

  /** The reviews the signed-in owner has written, so the app can show
   * "Tu calificación" instead of asking again. */
  @Get('me/reviews')
  @UseGuards(JwtAuthGuard)
  async mine(@CurrentAccount() account: AuthenticatedAccount) {
    const rows = await this.reviews.find({
      where: { ownerId: account.accountId },
      order: { createdAt: 'DESC' },
    });
    return { data: rows.map(toOwnReview) };
  }

  /** The business answers a review of its own, publicly. The update
   * leaves the review's own updatedAt alone: the review didn't change. */
  @Put('providers/me/reviews/:reviewId/reply')
  @UseGuards(JwtAuthGuard)
  async reply(
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyReviewDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    const review = await this.reviews.findOne({
      where: { id: reviewId, providerId: account.accountId },
    });
    if (!review) {
      throw new ResourceNotFoundError('Esa reseña no es de tu negocio.');
    }
    review.respond(dto.reply ?? null);
    // Plain SQL so updated_at (the review's own edit date) stays as it is.
    await this.reviews.query(
      `UPDATE providers_reviews SET reply = ?, reply_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ?`,
      [review.reply, review.reply, review.id],
    );
    const saved = await this.reviews.findOneOrFail({
      where: { id: review.id },
    });
    return {
      data: { id: saved.id, reply: saved.reply, replyAt: saved.replyAt },
    };
  }

  /** Writes a review, or edits the one already there for the same
   * booking (or, for a business not booked in the app, the same owner). */
  @Post('providers/:accountId/reviews')
  @UseGuards(JwtAuthGuard)
  async write(
    @Param('accountId') accountId: string,
    @Body() dto: WriteReviewDto,
    @CurrentAccount() account: AuthenticatedAccount,
  ) {
    if (!account.roles.includes('owner')) {
      throw new RoleRequiredError(
        'Para dejar una reseña necesitas una cuenta de dueño.',
      );
    }
    if (account.accountId === accountId) {
      throw new ValidationError('No puedes reseñar tu propio negocio.');
    }
    const profile = await this.profiles.findOne({
      where: { ...PUBLICLY_VISIBLE, accountId },
    });
    if (!profile) {
      throw new ResourceNotFoundError('Este negocio no está en el directorio.');
    }

    let existing: Review | null;
    let bookingId: string | null = null;
    if (isBookable(profile.category)) {
      if (!dto.bookingId) {
        throw new BookingNotEligibleForReviewError(
          'Puedes calificar a este negocio desde "Mis reservas", después de tu servicio.',
        );
      }
      const booking = await this.bookings.findOne({
        where: { id: dto.bookingId },
      });
      if (
        !booking ||
        booking.ownerId !== account.accountId ||
        booking.providerId !== accountId
      ) {
        throw new BookingNotEligibleForReviewError('Esta reserva no es tuya.');
      }
      if (
        !SERVED_STATUSES.includes(booking.status) ||
        booking.scheduledAt > new Date()
      ) {
        throw new BookingNotEligibleForReviewError(
          'Podrás calificar este servicio cuando haya ocurrido.',
        );
      }
      bookingId = booking.id;
      existing = await this.reviews.findOne({ where: { bookingId } });
    } else {
      const owner = await this.accounts.findOneOrFail({
        where: { id: account.accountId },
      });
      if (!owner.emailVerifiedAt) {
        throw new BookingNotEligibleForReviewError(
          'Confirma tu correo para dejar una reseña.',
        );
      }
      existing = await this.reviews.findOne({
        where: {
          ownerId: account.accountId,
          providerId: accountId,
          bookingId: IsNull(),
        },
      });
    }

    const review =
      existing ??
      Review.write({
        providerId: accountId,
        ownerId: account.accountId,
        bookingId,
        rating: dto.rating,
        comment: dto.comment,
      });
    if (existing) existing.edit(dto.rating, dto.comment ?? null);
    await this.reviews.save(review);
    return { data: toOwnReview(review) };
  }
}

function toOwnReview(r: Review) {
  return {
    id: r.id,
    providerId: r.providerId,
    bookingId: r.bookingId,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** "Ana García López" → "Ana G." — enough to read as a person, without
 * publishing a customer's full name on a business's page. */
export function shortName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Dueño de PET Conect@';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0].toUpperCase()}.`;
}
