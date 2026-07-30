import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
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
