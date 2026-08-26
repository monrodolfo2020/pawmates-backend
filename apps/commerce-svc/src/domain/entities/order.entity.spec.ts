import { Money, OrderDeliveryNotReadyError } from '@pawmates/common';
import { OrderLineItem } from './order-line-item.entity';
import { Order } from './order.entity';
import { OrderStatus } from '../value-objects/order-status';

function makeOrder(): Order {
  const line = OrderLineItem.from(
    { id: 'product-1', name: 'Premios de pollo', price: Money.of(800, 'USD') },
    2,
  );
  return Order.place({
    ownerId: 'owner-1',
    storefrontId: 'storefront-1',
    providerId: 'provider-1',
    idempotencyKey: 'idem-1',
    lines: [line],
    total: Money.of(1600, 'USD'),
  });
}

describe('Order aggregate', () => {
  it('starts in PendingPayment with a generated id', () => {
    const order = makeOrder();
    expect(order.status).toBe(OrderStatus.PendingPayment);
    expect(order.id).toBeTruthy();
  });

  it('walks the happy path through markPaid -> attachDeliveryBooking -> openDeliveryWindow -> confirmDelivered', () => {
    const order = makeOrder();

    order.markPaid();
    expect(order.status).toBe(OrderStatus.Paid);
    expect(order.paidAt).toBeInstanceOf(Date);

    order.attachDeliveryBooking('booking-1');
    expect(order.status).toBe(OrderStatus.AwaitingDelivery);
    expect(order.deliveryBookingId).toBe('booking-1');

    order.openDeliveryWindow();
    expect(order.deliveryWindowOpenAt).toBeInstanceOf(Date);

    order.confirmDelivered();
    expect(order.status).toBe(OrderStatus.Delivered);
    expect(order.deliveredAt).toBeInstanceOf(Date);
  });

  it('refuses to confirm delivery before the delivery window has opened', () => {
    const order = makeOrder();
    order.markPaid();
    order.attachDeliveryBooking('booking-1');

    expect(() => order.confirmDelivered()).toThrow(OrderDeliveryNotReadyError);
    expect(order.status).toBe(OrderStatus.AwaitingDelivery);
  });

  it('throws on an invalid transition (e.g. delivering before paying)', () => {
    const order = makeOrder();
    expect(() => order.attachDeliveryBooking('booking-1')).toThrow(
      /Invalid Order transition/,
    );
  });

  it('refunds a Paid order', () => {
    const order = makeOrder();
    order.markPaid();

    order.refund();

    expect(order.status).toBe(OrderStatus.Refunded);
    expect(order.refundedAt).toBeInstanceOf(Date);
  });

  it('refunds an AwaitingDelivery order too', () => {
    const order = makeOrder();
    order.markPaid();
    order.attachDeliveryBooking('booking-1');

    order.refund();

    expect(order.status).toBe(OrderStatus.Refunded);
  });

  it('exposes total as Money', () => {
    const order = makeOrder();
    expect(order.total.equals(Money.of(1600, 'USD'))).toBe(true);
  });
});
