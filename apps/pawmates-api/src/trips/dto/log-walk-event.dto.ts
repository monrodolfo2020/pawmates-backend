import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { WALK_EVENT_TYPES } from '../../booking/domain/entities/walk-event.entity';
import type { WalkEventType } from '../../booking/domain/entities/walk-event.entity';

/** POST /v1/trips/:bookingId/events — the walker logs a photo or a pee/poop mark. */
export class LogWalkEventDto {
  @IsIn([...WALK_EVENT_TYPES])
  type!: WalkEventType;

  // Required for 'photo', ignored for 'pee'/'poop'.
  @ValidateIf((dto: LogWalkEventDto) => dto.type === 'photo')
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
