import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** PATCH /v1/me — what a person can change about their own account. */
export class UpdateMeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;
}

/** POST /v1/me/password — the current password proves it's really them,
 * not someone holding an unlocked phone. */
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

/** POST /v1/me/email — the password again, for the same reason. */
export class RequestEmailChangeDto {
  @IsString()
  password!: string;

  @IsEmail({}, { message: 'Escribe un correo válido.' })
  @MaxLength(254)
  newEmail!: string;
}

/** POST /v1/me/email/confirm — the code sent to the new address. */
export class ConfirmEmailChangeDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'El código tiene 6 dígitos.' })
  code!: string;
}
