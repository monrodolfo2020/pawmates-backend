import { IsIn, IsString } from 'class-validator';
import { BUSINESS_PLANS } from '../../domain/value-objects/business-plan';

/** PATCH /v1/admin/businesses/:accountId/plan */
export class UpdateBusinessPlanDto {
  @IsString()
  @IsIn([...BUSINESS_PLANS])
  plan!: string;
}
