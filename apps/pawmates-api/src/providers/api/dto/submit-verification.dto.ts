import { IsString, MaxLength } from 'class-validator';

/** POST /v1/providers/me/verification */
export class SubmitVerificationDto {
  @IsString()
  facePhoto!: string;

  @IsString()
  idDocumentPhoto!: string;

  /** The version of the identity-verification consent the screen showed.
   * Sending the photos is consenting to them being processed, and that
   * consent has to be expressed separately and recorded (see
   * legal-document.ts). */
  @IsString()
  @MaxLength(20)
  consentVersion!: string;
}
