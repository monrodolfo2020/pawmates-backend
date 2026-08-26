import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** POST /v1/storefronts — a provider opens their own mini-shop. */
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
