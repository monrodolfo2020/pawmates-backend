import { Column, CreateDateColumn, PrimaryColumn } from 'typeorm';

/**
 * Domain event log (Data Model doc Convención 05's Transactional Outbox,
 * kept as an audit trail even without a broker to drain it into — see
 * README's "Consolidated MVP" section). Every aggregate write that used to
 * publish a domain event still INSERTs one of these in the same DB
 * transaction; nothing reads them back out today, but the shape stays
 * exactly what a real relay-to-broker job would need if one gets added.
 */
export abstract class OutboxEventBase {
  // A ULID (Data Model doc §13's "ordenable por tiempo" ID convention),
  // not an RFC-4122 UUID — Postgres's `uuid` type rejects ULID's Crockford
  // base32 encoding, so this column is `text`.
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text' })
  topic!: string;

  @Column({ name: 'event_type', type: 'text' })
  eventType!: string;

  @Column({ name: 'partition_key', type: 'text' })
  partitionKey!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ name: 'trace_id', type: 'text' })
  traceId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
