import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * POST /v1/storefronts/me/products — a provider lists an item from the
 * admin-curated catalog (see AddProductCatalog migration: no more
 * free-text name/description/category). Price and stock are theirs to
 * set; omit priceAmount to use the catalog's suggested price as-is.
 * `photos` is required (3-6 images) — every product added from here on
 * needs a real gallery; only pre-existing products may still have none
 * (see Product.photos).
 */
export class AddProductDto {
  @IsString()
  catalogItemId!: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  priceAmount?: number;

  @IsString()
  @IsIn(['USD'])
  @IsOptional()
  priceCurrency?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockQuantity?: number; // absent = unlimited (e.g. a service add-on)

  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(6)
  @IsString({ each: true })
  photos!: string[]; // base64 data URLs
}
