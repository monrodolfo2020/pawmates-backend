import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const PRODUCT_CATEGORIES = [
  'treat',
  'toy',
  'accessory',
  'service_addon',
  'other',
] as const;

/** POST /v1/storefronts/me/products */
export class AddProductDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  priceAmount!: number; // minor currency unit

  @IsString()
  @IsIn(['USD'])
  priceCurrency!: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stockQuantity?: number; // absent = unlimited (e.g. a service add-on)

  @IsIn(PRODUCT_CATEGORIES)
  category!: (typeof PRODUCT_CATEGORIES)[number];
}
