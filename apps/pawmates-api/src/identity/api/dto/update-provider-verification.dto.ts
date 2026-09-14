import { IsIn } from 'class-validator';

/** PATCH /v1/admin/provider-verifications/:id — never accepts 'pending'
 * back; that's only the state a fresh signup starts in. */
export class UpdateProviderVerificationDto {
  @IsIn(['verified', 'rejected'])
  status!: 'verified' | 'rejected';
}
