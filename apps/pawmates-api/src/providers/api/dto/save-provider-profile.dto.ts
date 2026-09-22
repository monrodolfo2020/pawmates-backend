import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SERVICE_CATEGORIES } from '../../domain/value-objects/service-category';

/**
 * PATCH /v1/providers/me — every field is optional (partial update: send
 * only what changed) and every field accepts an empty string to clear it
 * back to unset (the controller normalizes '' to null before handing it
 * to ProviderProfile.update(), which is what actually decides — via
 * whether bio+price are both present — whether the profile is publicly
 * visible; see that entity's comment). address/idNumber/age/phone are
 * private (never returned by a public endpoint) — see the entity's and
 * ProvidersController's comments.
 */
export class SaveProviderProfileDto {
  @IsString()
  @IsIn([...SERVICE_CATEGORIES])
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  businessName?: string;

  /** Gallery for the micro-page: base64 data URLs for new photos, the
   * existing hosted URL for ones already uploaded. Unlike the other
   * fields, this replaces the whole list — an empty array clears it. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  photos?: string[];

  /** VIP only — the micro-page design being drafted. Shape-checked by
   * parsePageDesign (page-design.ts) rather than class-validator, since
   * it needs normalizing (missing sections, defaults) as much as
   * validating. */
  @IsObject()
  @IsOptional()
  design?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  publicAddress?: string;

  @IsString()
  @IsOptional()
  hours?: string;

  @IsString()
  @IsOptional()
  whatsapp?: string;

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

  @IsString()
  @IsOptional()
  plansOffered?: string;

  @IsString()
  @IsOptional()
  walkingSpots?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  idNumber?: string;

  @IsInt()
  @Min(18)
  @IsOptional()
  age?: number;

  @IsString()
  @IsOptional()
  phone?: string;

  /** Where the business is. Both or neither — see ProviderProfile.update.
   * null clears the location. */
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number | null;
}
