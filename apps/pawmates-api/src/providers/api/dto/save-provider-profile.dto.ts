import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * PATCH /v1/providers/me — every field is optional (partial update: send
 * only what changed) and every field accepts an empty string to clear it
 * back to unset (the controller normalizes '' to null before handing it
 * to ProviderProfile.update(), which is what actually decides — via
 * whether bio+price are both present — whether the profile is publicly
 * visible; see that entity's comment).
 */
export class SaveProviderProfileDto {
  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  serviceArea?: string;

  @IsString()
  @IsOptional()
  specialty?: string;

  @IsString()
  @IsOptional()
  photo?: string; // base64 data URL, an existing hosted URL, or '' to remove it

  @IsInt()
  @Min(1)
  @IsOptional()
  priceAmount?: number;

  @IsString()
  @IsIn(['MXN'])
  @IsOptional()
  priceCurrency?: string;
}
