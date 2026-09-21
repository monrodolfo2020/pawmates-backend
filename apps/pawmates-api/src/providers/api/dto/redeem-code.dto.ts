import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /v1/billing/redeem */
export class RedeemCodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;
}
