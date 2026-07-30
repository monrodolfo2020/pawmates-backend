import { KAFKA_TOPICS } from '@pawmates/common';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Consumer } from 'kafkajs';
import { BookingProcessManager } from '../../domain/saga/booking-process-manager';
import { createKafkaClient } from './kafka-client.provider';

interface GpsEventEnvelope {
  eventId: string;
  traceId: string;
  // Expected values are 'TripStarted' | 'TripCompleted' — kept as `string`
  // since any other event type on this topic is simply ignored below,
  // not a type error.
  type: string;
  payload: { tripId: string; bookingId: string };
}

/**
 * Consumes gps.events for TripStarted / TripCompleted. This is the one
 * genuinely asynchronous leg of the whole saga: gps-svc owns the Trip
 * aggregate and the "start/complete service" REST actions
 * (`POST /v1/trips/{id}/start|complete`, API Design doc §05), so
 * booking-svc learns about them the same way every other context does —
 * by consuming the event, not by being called directly.
 *
 * Idempotent by construction: Booking.start()/complete() are guarded by
 * the BookingStatus transition table, so replaying the same event twice
 * (at-least-once delivery, Architecture §09) throws on the second replay
 * inside a try/catch that just logs and moves on — never double-applies.
 */
@Injectable()
export class GpsEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpsEventsConsumer.name);
  private readonly consumer: Consumer;

  constructor(private readonly processManager: BookingProcessManager) {
    this.consumer = createKafkaClient().consumer({
      groupId: 'booking-svc.gps-events',
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.gps,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as GpsEventEnvelope;
        await this.handle(event);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handle(event: GpsEventEnvelope): Promise<void> {
    try {
      if (event.type === 'TripStarted') {
        await this.processManager.markInProgress(event.payload.bookingId);
      } else if (event.type === 'TripCompleted') {
        await this.processManager.completeService(
          event.payload.bookingId,
          event.traceId,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed handling ${event.type} for booking ${event.payload?.bookingId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      // Left uncommitted-in-effect on purpose: kafkajs auto-commits offsets
      // by default, so a transient failure here relies on the DLQ pattern
      // (Architecture §09) in production rather than blocking the
      // partition — out of scope for this reference consumer.
    }
  }
}
