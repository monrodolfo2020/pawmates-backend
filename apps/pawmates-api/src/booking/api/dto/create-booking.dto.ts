import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

export class BookingLineDto {
  @IsUUID()
  petId!: string;

  @IsUUID()
  serviceTypeCode!: string;

  @IsInt()
  @Min(1)
  durationValue!: number;

  @IsIn(['min', 'hour', 'day'])
  durationUnit!: 'min' | 'hour' | 'day';

  @IsUUID()
  addressId!: string;

  /** One of the business's services (BusinessService.id). When present,
   * the booking is priced and timed from that service. */
  @Matches(/^[a-z0-9]{4,24}$/)
  @IsOptional()
  serviceId?: string;
}

/** Mirrors API Design doc §04 — POST /v1/bookings. */
export class CreateBookingDto {
  @IsUUID()
  providerServiceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  lines!: BookingLineDto[];

  @IsISO8601()
  @IsOptional()
  scheduledAt?: string; // absent = immediate booking
}
