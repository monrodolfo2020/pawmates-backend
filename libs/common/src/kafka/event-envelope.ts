/**
 * Envelope every domain event carries (Architecture doc, §09 "Convenciones
 * obligatorias del bus"). `traceId` is propagated from the originating
 * HTTP request so an incident can be followed end to end across the
 * sync (gRPC) and async (Kafka) hops alike.
 */
export interface EventEnvelope<TPayload = unknown> {
  eventId: string;
  occurredAt: string; // ISO-8601
  producerContext: string; // e.g. "booking"
  traceId: string;
  type: string; // e.g. "BookingCreated"
  payload: TPayload;
}

export function makeEnvelope<TPayload>(
  producerContext: string,
  type: string,
  traceId: string,
  payload: TPayload,
  eventId: string,
): EventEnvelope<TPayload> {
  return {
    eventId,
    occurredAt: new Date().toISOString(),
    producerContext,
    traceId,
    type,
    payload,
  };
}
