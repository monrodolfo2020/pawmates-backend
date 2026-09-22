import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AcceptLegalDto } from './accept-legal.dto';
import { SERVICE_CATEGORIES } from '../../../providers/domain/value-objects/service-category';

/**
 * POST /v1/auth/signup. `facePhoto`/`idDocumentPhoto` (base64, no data:
 * URI prefix) are required when role is 'provider' — checked in
 * AuthController, not here, since that's a cross-field rule
 * class-validator can't express as cleanly as a plain if.
 */
export class SignupDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsIn(['owner', 'provider'])
  role!: 'owner' | 'provider';

  @IsString()
  @IsOptional()
  name?: string;

  /** Only meaningful with role 'provider' — what kind of pet business
   * this is, which decides where it lands in the directory and whether
   * it needs a rate to publish (see ProviderProfile). */
  @IsString()
  @IsIn([...SERVICE_CATEGORIES])
  @IsOptional()
  category?: string;

  /** The business's public name, when it differs from the person's own
   * (`name` above) — "Estética Canina Guau", not "Ana Pérez". */
  @IsString()
  @IsOptional()
  businessName?: string;

  @IsString()
  @IsOptional()
  facePhoto?: string;

  @IsString()
  @IsOptional()
  idDocumentPhoto?: string;

  /** Optional — a provider can reuse `facePhoto` as their public page's
   * photo (the app's "Usar esta fotografía" button) or pick a different
   * one, right at signup instead of having to visit "Editar mi página
   * pública" first. Seeds ProviderProfile.photoBase64; unrelated to
   * facePhoto/idDocumentPhoto, which stay in ProviderVerification and are
   * never editable (see AuthService.signup's comment). */
  @IsString()
  @IsOptional()
  profilePhoto?: string;

  /**
   * The documents this person accepted, each with the version their
   * screen showed. Required: an account can't be created without it, and
   * the version has to be the one in force (see legal-document.ts). A
   * provider sending identity photos must include the separate
   * verification consent too — checked in AuthController.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AcceptLegalDto)
  acceptedLegal!: AcceptLegalDto[];
}
