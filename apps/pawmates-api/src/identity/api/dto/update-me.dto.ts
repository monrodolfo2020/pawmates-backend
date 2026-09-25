import { IsString, MaxLength, MinLength } from 'class-validator';

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
