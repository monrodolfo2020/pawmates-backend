import { IsIn, IsString } from 'class-validator';
import { BILLING_PERIODS } from '../../domain/value-objects/billing';

/** POST /v1/billing/checkout */
export class StartCheckoutDto {
  @IsString()
  @IsIn([...BILLING_PERIODS])
  period!: string;
}
