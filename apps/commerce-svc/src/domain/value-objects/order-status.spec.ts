import { OrderStatus, canTransition } from './order-status';

describe('canTransition (Order state machine)', () => {
  it('allows the full happy path Paid -> AwaitingDelivery -> Delivered', () => {
    expect(canTransition(OrderStatus.Paid, OrderStatus.AwaitingDelivery)).toBe(
      true,
    );
    expect(
      canTransition(OrderStatus.AwaitingDelivery, OrderStatus.Delivered),
    ).toBe(true);
  });

  it('allows refund from Paid and AwaitingDelivery', () => {
    expect(canTransition(OrderStatus.Paid, OrderStatus.Refunded)).toBe(true);
    expect(
      canTransition(OrderStatus.AwaitingDelivery, OrderStatus.Refunded),
    ).toBe(true);
  });

  it('never allows refunding a delivered order', () => {
    expect(canTransition(OrderStatus.Delivered, OrderStatus.Refunded)).toBe(
      false,
    );
  });

  it('never allows skipping straight from Paid to Delivered', () => {
    expect(canTransition(OrderStatus.Paid, OrderStatus.Delivered)).toBe(false);
  });

  it('treats Delivered and Refunded as terminal states', () => {
    expect(
      canTransition(OrderStatus.Delivered, OrderStatus.AwaitingDelivery),
    ).toBe(false);
    expect(canTransition(OrderStatus.Refunded, OrderStatus.Paid)).toBe(false);
  });
});
