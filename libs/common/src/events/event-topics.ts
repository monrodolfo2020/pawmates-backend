/**
 * One category per Bounded Context — never one per event type. Used to
 * label rows in each service's own `outbox_events` table (see
 * persistence/outbox-event.base.ts): in the original multi-service design
 * this doubled as the literal Kafka topic a relay job published to; the
 * consolidated MVP (see README) has no broker, so it's now purely a
 * domain-event-log category. Kept anyway — cheap to keep, and a real
 * broker could be reintroduced later without touching either
 * process manager's own event-writing code.
 */
export const EVENT_TOPICS = {
  booking: 'booking.events',
  commerce: 'commerce.events',
} as const;

export type EventTopic = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];
