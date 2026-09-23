import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** PATCH /v1/admin/accounts/:id — name and email only. Roles are not
 * editable here on purpose: see AdminController.updateAccount. */
export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}

/** PATCH /v1/admin/accounts/:id/status */
export class UpdateAccountStatusDto {
  @IsBoolean()
  enabled!: boolean;
}

/** DELETE /v1/admin/accounts/:id — the account's own email, typed by the
 * admin, as proof they mean this account. */
export class DeleteAccountDto {
  @IsString()
  @MaxLength(200)
  confirmEmail!: string;
}
