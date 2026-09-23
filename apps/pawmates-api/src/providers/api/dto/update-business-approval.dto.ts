import { IsBoolean } from 'class-validator';

/** PATCH /v1/admin/businesses/:accountId/approval */
export class UpdateBusinessApprovalDto {
  @IsBoolean()
  approved!: boolean;
}
