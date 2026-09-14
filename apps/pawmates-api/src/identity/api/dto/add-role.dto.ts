import { IsIn, IsOptional, IsString } from 'class-validator';

/** POST /v1/auth/roles — an existing account picks up a second role. */
export class AddRoleDto {
  @IsIn(['owner', 'provider'])
  role!: 'owner' | 'provider';

  @IsString()
  @IsOptional()
  facePhoto?: string;

  @IsString()
  @IsOptional()
  idDocumentPhoto?: string;

  /** Same "Usar esta fotografía" option as SignupDto.profilePhoto — see
   * its comment. */
  @IsString()
  @IsOptional()
  profilePhoto?: string;
}
