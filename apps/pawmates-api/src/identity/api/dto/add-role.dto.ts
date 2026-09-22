import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { SERVICE_CATEGORIES } from '../../../providers/domain/value-objects/service-category';
import { AcceptLegalDto } from './accept-legal.dto';

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

  /** The documents accepted for the role being taken on — a new role
   * brings a document the account hasn't agreed to yet (see
   * AuthController's assertAcceptedRequiredDocuments). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcceptLegalDto)
  acceptedLegal!: AcceptLegalDto[];
}
