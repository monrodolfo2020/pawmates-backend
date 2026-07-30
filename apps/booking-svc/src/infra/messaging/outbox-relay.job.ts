import { OutboxRelay } from '@pawmates/common';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { Producer } from 'kafkajs';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../../domain/entities/outbox-event.entity';
import { createKafkaClient } from './kafka-client.provider';

/**
 * Drains booking.outbox_events to Kafka every few seconds (Architecture
 * §09's Outbox Relay, generic logic in libs/common/kafka/outbox-relay.ts —
 * this is the Nest-specific wiring: a producer connection plus a cron
 * trigger).
 */
@Injectable()
export class OutboxRelayJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayJob.name);
  private readonly producer: Producer;
  private readonly relay: OutboxRelay;
  private running = false;

  constructor(@InjectRepository(OutboxEvent) repo: Repository<OutboxEvent>) {
    this.producer = createKafkaClient().producer();
    this.relay = new OutboxRelay(repo, this.producer, this.logger);
  }

  async onModuleInit() {
    await this.producer.connect();
  }

  async onModuleDestroy() {
    await this.producer.disconnect();
  }

  @Cron(CronExpression.EVERY_5_SECONDS)
  async handleCron() {
    if (this.running) return; // don't overlap a slow poll with the next tick
    this.running = true;
    try {
      const count = await this.relay.dispatchPending();
      if (count > 0) this.logger.log(`Dispatched ${count} outbox event(s)`);
    } finally {
      this.running = false;
    }
  }
}
