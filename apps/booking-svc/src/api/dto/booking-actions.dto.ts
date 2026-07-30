import { IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

/** POST /v1/bookings/{id}/accept — provider accepts, payment is authorized. */
export class AcceptBookingDto {
  @IsUUID()
  paymentMethodId!: string;
}

/** POST /v1/bookings/{id}/reject */
export class RejectBookingDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/** POST /v1/bookings/{id}/cancel */
export class CancelBookingDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/** POST /v1/bookings/{id}/reschedule */
export class RescheduleBookingDto {
  @IsISO8601()
  proposedStart!: string;
}
