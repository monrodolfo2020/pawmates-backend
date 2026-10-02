import { IsOptional, IsString, MaxLength } from 'class-validator';

/** PUT /v1/providers/me/reviews/:reviewId/reply — empty or missing
 * removes the reply. */
export class ReplyReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reply?: string | null;
}
