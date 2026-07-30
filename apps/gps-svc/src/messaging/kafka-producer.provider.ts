import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

/**
 * Thin kafkajs wrapper — mirrors booking-svc's own
 * infra/messaging/kafka-client.provider.ts. No outbox here (yet): a full
 * gps-svc would persist Trip/location updates and drain them via the same
 * transactional-outbox pattern as booking-svc; this skeleton publishes
 * directly so the TripStarted/TripCompleted contract can be exercised.
 */
@Injectable()
export class KafkaProducerProvider implements OnModuleInit, OnModuleDestroy {
  private readonly producer: Producer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'gps-svc',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    });
    this.producer = kafka.producer();
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  async send(topic: string, key: string, value: unknown): Promise<void> {
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value) }],
    });
  }
}
