import { IsString, MaxLength, MinLength } from 'class-validator';

/** POST /v1/bookings/{id}/messages */
export class SendMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}
