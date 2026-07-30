import type { Producer } from 'kafkajs';
import type { Repository } from 'typeorm';
import type { OutboxEventBase } from '../persistence/outbox-event.base';

export interface OutboxRelayLogger {
  log(message: string): void;
  error(message: string, trace?: string): void;
}

/**
 * Drains a service's outbox table to Kafka. Framework-agnostic on purpose
 * (plain class, not a Nest provider) so any service can wire it into a
 * `@Cron` job with its own TypeORM repository and kafkajs producer —
 * see apps/booking-svc/src/infra/messaging/outbox-relay.job.ts for the
 * reference wiring.
 *
 * At-least-once by construction: a row is only marked dispatched *after*
 * Kafka acks it, so a crash between publish and mark-dispatched re-sends
 * on the next poll — consumers must be idempotent (Architecture §09).
 */
export class OutboxRelay {
  constructor(
    private readonly repo: Repository<OutboxEventBase>,
    private readonly producer: Producer,
    private readonly logger: OutboxRelayLogger,
    private readonly batchSize = 100,
  ) {}

  async dispatchPending(): Promise<number> {
    const pending = await this.repo.find({
      where: { dispatchedAt: null as unknown as Date },
      order: { createdAt: 'ASC' },
      take: this.batchSize,
    });

    let dispatched = 0;
    for (const row of pending) {
      try {
        await this.producer.send({
          topic: row.topic,
          messages: [
            {
              key: row.partitionKey,
              value: JSON.stringify({
                eventId: row.id,
                occurredAt: row.createdAt.toISOString(),
                producerContext: row.topic.split('.')[0],
                traceId: row.traceId,
                type: row.eventType,
                payload: row.payload,
              }),
            },
          ],
        });
        row.dispatchedAt = new Date();
        await this.repo.save(row);
        dispatched++;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch outbox event ${row.id} (${row.eventType})`,
          err instanceof Error ? err.stack : undefined,
        );
        // Leave dispatchedAt null — the next poll retries it.
      }
    }
    return dispatched;
  }
}
