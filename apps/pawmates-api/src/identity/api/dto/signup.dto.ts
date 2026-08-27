import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

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

  @IsString()
  @IsOptional()
  facePhoto?: string;

  @IsString()
  @IsOptional()
  idDocumentPhoto?: string;
}
