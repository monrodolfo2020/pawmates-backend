import { IsIn, IsOptional, IsString } from 'class-validator';
import { SERVICE_CATEGORIES } from '../../../providers/domain/value-objects/service-category';

/** POST /v1/auth/roles — an existing account picks up a second role. */
export class AddRoleDto {
  @IsIn(['owner', 'provider'])
  role!: 'owner' | 'provider';

  /** Only meaningful with role 'provider' — seeds the new business's
   * directory listing (see AuthService.seedProviderProfile). */
  @IsString()
  @IsIn([...SERVICE_CATEGORIES])
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  businessName?: string;

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
