import { TooManyRequestsError } from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { RateLimitRule } from './rate-limit-rules';

/** Old rows are swept now and then rather than on a schedule. */
const SWEEP_PROBABILITY = 0.01;
const SWEEP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Counts attempts per (rule, subject) in the rate_limits table and
 * refuses once a rule's limit is reached within its window.
 *
 * Two ways to use it:
 * - `consume` counts and refuses in one step, for things that should be
 *   limited whether they succeed or not (sending an email).
 * - `assertAllowed` before, and `record` only on failure, for things where
 *   only failures should count (a wrong password), plus `clear` on
 *   success.
 */
@Injectable()
export class RateLimiter {
  constructor(private readonly db: DataSource) {}

  /** Refuses if the limit is already reached; counts nothing. */
  async assertAllowed(
    rule: RateLimitRule,
    subject: string,
    now = Date.now(),
  ): Promise<void> {
    const rows: { count: number; window_start_ms: number }[] =
      await this.db.query(
        `SELECT count, window_start_ms FROM rate_limits WHERE key = ?`,
        [keyOf(rule, subject)],
      );
    const row = rows[0];
    if (!row) return;
    const endsAt = Number(row.window_start_ms) + rule.windowMs;
    if (now < endsAt && Number(row.count) >= rule.max)
      throw refusal(rule, endsAt - now);
  }

  /** Counts one; returns the count within the current window. */
  async record(
    rule: RateLimitRule,
    subject: string,
    now = Date.now(),
  ): Promise<number> {
    const windowOpenedBefore = now - rule.windowMs;
    // One statement, so two requests at once can't both read the old
    // count: an expired window restarts at 1, a live one goes up by 1.
    const rows: { count: number }[] = await this.db.query(
      `INSERT INTO rate_limits (key, count, window_start_ms) VALUES (?, 1, ?)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start_ms <= ? THEN 1 ELSE count + 1 END,
         window_start_ms = CASE WHEN window_start_ms <= ? THEN excluded.window_start_ms ELSE window_start_ms END
       RETURNING count`,
      [keyOf(rule, subject), now, windowOpenedBefore, windowOpenedBefore],
    );
    if (Math.random() < SWEEP_PROBABILITY) {
      void this.db
        .query(`DELETE FROM rate_limits WHERE window_start_ms < ?`, [
          now - SWEEP_AFTER_MS,
        ])
        .catch(() => undefined);
    }
    return Number(rows[0]?.count ?? 1);
  }

  /** Counts one and refuses if that went over the limit. */
  async consume(
    rule: RateLimitRule,
    subject: string,
    now = Date.now(),
  ): Promise<void> {
    await this.assertAllowed(rule, subject, now);
    const count = await this.record(rule, subject, now);
    if (count > rule.max) throw refusal(rule, rule.windowMs);
  }

  /** Whether one more is allowed — counts it if so. For callers that
   * degrade quietly instead of refusing (the address search). */
  async tryConsume(
    rule: RateLimitRule,
    subject: string,
    now = Date.now(),
  ): Promise<boolean> {
    try {
      await this.consume(rule, subject, now);
      return true;
    } catch (err) {
      if (err instanceof TooManyRequestsError) return false;
      throw err;
    }
  }

  async clear(rule: RateLimitRule, subject: string): Promise<void> {
    await this.db.query(`DELETE FROM rate_limits WHERE key = ?`, [
      keyOf(rule, subject),
    ]);
  }
}

function keyOf(rule: RateLimitRule, subject: string): string {
  return `${rule.name}:${subject.trim().toLowerCase()}`;
}

function refusal(
  rule: RateLimitRule,
  remainingMs: number,
): TooManyRequestsError {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const hours = Math.ceil(minutes / 60);
  const wait =
    minutes >= 60
      ? hours === 1
        ? '1 hora'
        : `${hours} horas`
      : minutes === 1
        ? '1 minuto'
        : `${minutes} minutos`;
  return new TooManyRequestsError(rule.message.replace('{minutes}', wait));
}
