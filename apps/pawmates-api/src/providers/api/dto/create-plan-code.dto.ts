import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BILLING_PERIODS } from '../../domain/value-objects/billing';

/** POST /v1/admin/plan-codes */
export class CreatePlanCodeDto {
  @IsString()
  @IsIn([...BILLING_PERIODS])
  period!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxUses?: number;
}
