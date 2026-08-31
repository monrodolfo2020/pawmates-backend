import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Backs IdempotencyInterceptor. Was a Redis hash before the Turso
 * migration (see README's Database section) — Redis was one more service
 * to operate for a single GET/SET-with-TTL, and Vercel's serverless
 * functions don't hold a persistent Redis connection well anyway, so this
 * moved into the same database instead of swapping Redis for something
 * else. Not a domain entity — no context table-name prefix.
 */
@Entity({ name: 'idempotency_keys' })
export class IdempotencyKey {
  @PrimaryColumn('text')
  key!: string;

  @Column({ name: 'response_status', type: 'int' })
  responseStatus!: number;

  @Column({ name: 'response_body', type: 'simple-json' })
  responseBody!: unknown;

  @Column({ name: 'expires_at', type: 'datetime' })
  expiresAt!: Date;
}
