import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { BookingLineDto } from './create-booking.dto';

class RecurrenceRuleDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  daysOfWeek!: number[];

  @IsString()
  timeOfDay!: string; // "HH:mm"

  @IsObject()
  endCondition!: { type: 'date' | 'count'; value: string | number };
}

/** Mirrors API Design doc §04 — POST /v1/bookings/recurring. */
export class CreateRecurringBookingDto {
  @IsUUID()
  providerServiceId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingLineDto)
  lines!: BookingLineDto[];

  @ValidateNested()
  @Type(() => RecurrenceRuleDto)
  recurrenceRule!: RecurrenceRuleDto;
}
