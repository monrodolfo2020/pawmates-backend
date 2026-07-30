import { Column, CreateDateColumn, PrimaryColumn } from 'typeorm';

/**
 * Transactional Outbox base (Architecture doc §09, Data Model doc
 * Convención 05). Every service that publishes domain events extends this
 * in its own schema — INSERTed in the same DB transaction as the
 * aggregate write, drained by that service's OutboxRelay. Never updated
 * except to flip `dispatchedAt` once Kafka acks the publish.
 */
export abstract class OutboxEventBase {
  // A ULID (Data Model doc §13's "ordenable por tiempo" ID convention),
  // not an RFC-4122 UUID — Postgres's `uuid` type rejects ULID's Crockford
  // base32 encoding, so this column is `text`.
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text' })
  topic!: string;

  @Column({ type: 'text' })
  eventType!: string;

  @Column({ type: 'text' })
  partitionKey!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text' })
  traceId!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt!: Date | null;
}
