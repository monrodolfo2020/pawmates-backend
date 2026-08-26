import { KAFKA_TOPICS } from '@pawmates/common';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { Consumer } from 'kafkajs';
import { CommerceProcessManager } from '../../domain/saga/commerce-process-manager';
import { createKafkaClient } from './kafka-client.provider';

interface BookingEventEnvelope {
  eventId: string;
  traceId: string;
  type: string; // only 'WalkFinished' is handled below; anything else is ignored
  payload: { bookingId: string };
}

/**
 * Consumes booking.events for WalkFinished — the signal that a walk (and
 * therefore any Order waiting to be delivered on it) has ended. Reuses
 * booking-svc's own domain event (emitted from
 * BookingProcessManager.completeService(), itself reacting to gps.events)
 * rather than commerce-svc subscribing to gps.events directly: Booking,
 * not Trip, owns "did this walk happen" as far as any other Bounded
 * Context is concerned.
 *
 * Only *opens the delivery window* — it never marks an Order Delivered by
 * itself. That's always an explicit walker confirmation
 * (CommerceProcessManager.confirmDelivery()), because a completed GPS
 * trip doesn't prove the product actually changed hands.
 */
@Injectable()
export class BookingEventsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BookingEventsConsumer.name);
  private readonly consumer: Consumer;

  constructor(private readonly processManager: CommerceProcessManager) {
    this.consumer = createKafkaClient().consumer({
      groupId: 'commerce-svc.booking-events',
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: KAFKA_TOPICS.booking,
      fromBeginning: false,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(
          message.value.toString(),
        ) as BookingEventEnvelope;
        await this.handle(event);
      },
    });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handle(event: BookingEventEnvelope): Promise<void> {
    if (event.type !== 'WalkFinished') return;
    try {
      await this.processManager.openDeliveryWindowForBooking(
        event.payload.bookingId,
      );
    } catch (err) {
      this.logger.error(
        `Failed handling WalkFinished for booking ${event.payload?.bookingId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      // At-least-once delivery (Architecture §09) — a transient failure here
      // relies on the DLQ pattern in production; out of scope for this
      // reference consumer, same as gps-events.consumer.ts in booking-svc.
    }
  }
}
