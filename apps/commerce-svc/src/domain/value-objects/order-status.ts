/**
 * OrderStatus — a storefront Order's lifecycle. Unlike Booking (authorized
 * at accept, captured at completion), an Order is charged in full at
 * checkout: PendingPayment only exists for the instant between "line items
 * validated" and "payment confirmed" inside placeOrder(), so it's never
 * actually persisted — Order.place() starts a row's real life at Paid.
 *
 * Delivery here means "the walker hands the product over on the owner's
 * next walk" (no shipping/carrier), so AwaitingDelivery only follows once
 * a confirmed future Booking exists between that owner and that provider
 * (RequiresUpcomingBookingPolicy) — and Delivered is only reachable via an
 * explicit walker confirmation, never inferred from GPS alone (see
 * infra/messaging/booking-events.consumer.ts).
 */
export enum OrderStatus {
  // Never actually persisted — Order.place() only exists in memory until
  // payment succeeds, so every row's real life starts at Paid. Modeled
  // anyway so the state machine reads as the full lifecycle, not just the
  // slice that hits the database.
  PendingPayment = 'pending_payment',
  Paid = 'paid',
  AwaitingDelivery = 'awaiting_delivery',
  Delivered = 'delivered',
  Refunded = 'refunded',
}

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PendingPayment]: [OrderStatus.Paid],
  [OrderStatus.Paid]: [OrderStatus.AwaitingDelivery, OrderStatus.Refunded],
  [OrderStatus.AwaitingDelivery]: [OrderStatus.Delivered, OrderStatus.Refunded],
  [OrderStatus.Delivered]: [],
  [OrderStatus.Refunded]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
