import { KAFKA_TOPICS, makeEnvelope } from '@pawmates/common';
import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ulid } from 'ulid';
import { KafkaProducerProvider } from '../messaging/kafka-producer.provider';

/**
 * Skeleton Trip API (gps.proto / API Design doc §05: "POST
 * /v1/trips/{id}/start|complete"). Real gps-svc owns location ingestion,
 * geofencing, and the Trip aggregate (Domain Model doc §10) — this
 * skeleton only emits the two events booking-svc's GpsEventsConsumer
 * reacts to, so the walk lifecycle can be driven end to end without
 * building real GPS tracking.
 */
@Controller('v1/trips')
export class TripsController {
  constructor(private readonly kafka: KafkaProducerProvider) {}

  @Post(':bookingId/start')
  async start(
    @Param('bookingId') bookingId: string,
    @Body('tripId') tripId: string | undefined,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const envelope = makeEnvelope(
      'gps',
      'TripStarted',
      traceId ?? ulid().toLowerCase(),
      { tripId: tripId ?? ulid().toLowerCase(), bookingId },
      ulid().toLowerCase(),
    );
    await this.kafka.send(KAFKA_TOPICS.gps, bookingId, envelope);
    return { data: { status: 'started' } };
  }

  @Post(':bookingId/complete')
  async complete(
    @Param('bookingId') bookingId: string,
    @Body('tripId') tripId: string | undefined,
    @Headers('x-trace-id') traceId: string | undefined,
  ) {
    const envelope = makeEnvelope(
      'gps',
      'TripCompleted',
      traceId ?? ulid().toLowerCase(),
      { tripId: tripId ?? ulid().toLowerCase(), bookingId },
      ulid().toLowerCase(),
    );
    await this.kafka.send(KAFKA_TOPICS.gps, bookingId, envelope);
    return { data: { status: 'completed' } };
  }
}
