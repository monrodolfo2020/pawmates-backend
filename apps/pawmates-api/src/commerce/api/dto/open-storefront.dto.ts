import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * POST /v1/storefronts — an admin opens a storefront on a provider's
 * behalf (see StorefrontController: this is admin-only for now, not
 * provider self-service).
 */
export class OpenStorefrontDto {
  @IsUUID()
  providerId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
