import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** PATCH /v1/admin/catalog/:id — admin-only. Photo is the main reason
 * this exists: the catalog seeds with photo_base64 NULL (see
 * AddProductCatalog migration), and the admin fills it in here. */
export class UpdateCatalogItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  suggestedPriceAmount?: number;

  @IsString()
  @IsOptional()
  photo?: string; // base64 data URL, same convention as Pet/ProviderVerification photos

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
