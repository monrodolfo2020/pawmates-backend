import { IsISO8601, IsLatitude, IsLongitude, IsOptional } from 'class-validator';

/** POST /v1/trips/:bookingId/locations — one GPS ping from the walker's app. */
export class LogLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsISO8601()
  @IsOptional()
  recordedAt?: string; // defaults to now — the walker's device clock isn't required
}
