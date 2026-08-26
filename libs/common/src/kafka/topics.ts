/**
 * One topic per Bounded Context (Architecture doc, ADR-02) — never one
 * topic per event type. Partition key is always the originating
 * aggregate root's id.
 */
export const KAFKA_TOPICS = {
  identity: 'identity.events',
  trustSafety: 'trust-safety.events',
  pets: 'pets.events',
  marketplace: 'marketplace.events',
  booking: 'booking.events',
  payments: 'payments.events',
  gps: 'gps.events',
  messaging: 'messaging.events',
  reviews: 'reviews.events',
  notifications: 'notifications.events',
  support: 'support.events',
  marketing: 'marketing.events',
  analytics: 'analytics.events',
  admin: 'admin.events',
  commerce: 'commerce.events',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
