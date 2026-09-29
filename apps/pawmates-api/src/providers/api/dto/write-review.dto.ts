import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** POST /v1/providers/:accountId/reviews */
export class WriteReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /** Required for a business booked through the app (a walker): the
   * booking being reviewed. Ignored for the rest. */
  @IsOptional()
  @IsString()
  bookingId?: string;
}
