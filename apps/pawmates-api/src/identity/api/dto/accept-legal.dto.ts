import { IsIn, IsString, MaxLength } from 'class-validator';
import { LEGAL_DOCUMENTS } from '../../domain/value-objects/legal-document';

/** POST /v1/legal/accept */
export class AcceptLegalDto {
  @IsString()
  @IsIn([...LEGAL_DOCUMENTS])
  type!: string;

  @IsString()
  @MaxLength(20)
  version!: string;
}
