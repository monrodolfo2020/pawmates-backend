import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * POST /v1/storefronts — admin-only (see StorefrontController), creates
 * the one platform-wide store if it doesn't exist yet. No providerId:
 * this isn't opened on any particular walker's behalf (see Storefront's
 * comment) — whichever admin calls this just becomes the row's
 * `provider_id` value, with no further meaning.
 */
export class OpenStorefrontDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
