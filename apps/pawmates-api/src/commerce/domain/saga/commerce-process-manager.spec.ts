import {
  InsufficientStockError,
  Money,
  NoUpcomingBookingError,
  OrderDeliveryNotReadyError,
  PaymentCardDeclinedError,
  TrustSafetyVerificationRequiredError,
  ValidationError,
} from '@pawmates/common';
import { DataSource, Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderLineItem } from '../entities/order-line-item.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Product } from '../entities/product.entity';
import { Storefront } from '../entities/storefront.entity';
import type { PaymentsPort } from '../ports/payments.port';
import type { TrustSafetyPort } from '../ports/trust-safety.port';
import { RequiresUpcomingBookingPolicy } from '../policies/requires-upcoming-booking.policy';
import { OrderStatus } from '../value-objects/order-status';
import { CommerceProcessManager } from './commerce-process-manager';

describe('CommerceProcessManager', () => {
  let manager: CommerceProcessManager;
  let storefronts: jest.Mocked<
    Pick<Repository<Storefront>, 'findOne' | 'save'>
  >;
  let products: jest.Mocked<
    Pick<Repository<Product>, 'find' | 'findOne' | 'save'>
  >;
  let orders: jest.Mocked<Pick<Repository<Order>, 'findOne' | 'find' | 'save'>>;
  let trustSafety: jest.Mocked<TrustSafetyPort>;
  let payments: jest.Mocked<PaymentsPort>;
  let requiresUpcomingBooking: jest.Mocked<
    Pick<
      RequiresUpcomingBookingPolicy,
      'findDeliveryBooking' | 'assertDeliveryBooking'
    >
  >;
  let txManagerSave: jest.Mock;
  let dataSource: DataSource;

  beforeEach(() => {
    storefronts = { findOne: jest.fn(), save: jest.fn() };
    products = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
    orders = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
    trustSafety = {
      checkVerificationValid: jest
        .fn()
        .mockResolvedValue({ valid: true, expiresAt: new Date() }),
    };
    payments = {
      chargeOrder: jest
        .fn()
        .mockResolvedValue({ transactionId: 'tx-1', status: 'captured' }),
      refundOrder: jest.fn().mockResolvedValue({ status: 'refunded' }),
    };
    requiresUpcomingBooking = {
      findDeliveryBooking: jest.fn().mockResolvedValue(null),
      assertDeliveryBooking: jest.fn(),
    };

    txManagerSave = jest.fn();
    const txManager = { save: txManagerSave };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<void>) =>
        cb(txManager),
      ),
    } as unknown as DataSource;

    manager = new CommerceProcessManager(
      dataSource,
      storefronts as unknown as Repository<Storefront>,
      products as unknown as Repository<Product>,
      orders as unknown as Repository<Order>,
      trustSafety,
      payments,
      requiresUpcomingBooking as unknown as RequiresUpcomingBookingPolicy,
    );
  });

  function makeStorefront(): Storefront {
    return Storefront.open({ providerId: 'provider-1', name: 'La tiendita' });
  }

  function makeProduct(stockQuantity: number | null = 10): Product {
    return Product.list({
      storefrontId: 'storefront-1',
      name: 'Premios de pollo',
      price: Money.of(800, 'USD'),
      stockQuantity,
      category: 'treat',
    });
  }

  describe('openStorefront', () => {
    it('checks verification then persists + enqueues StorefrontOpened', async () => {
      storefronts.findOne.mockResolvedValue(null);

      const storefront = await manager.openStorefront(
        { providerId: 'provider-1', name: 'La tiendita' },
        'trace-1',
      );

      expect(trustSafety.checkVerificationValid).toHaveBeenCalledWith({
        accountId: 'provider-1',
        requiredLevel: 'basic',
      });
      expect(storefront.providerId).toBe('provider-1');
      expect(txManagerSave).toHaveBeenCalledWith(
        Storefront,
        expect.any(Storefront),
      );
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'StorefrontOpened' }),
      );
    });

    it('is idempotent: one storefront per provider', async () => {
      const existing = makeStorefront();
      storefronts.findOne.mockResolvedValue(existing);

      const result = await manager.openStorefront(
        { providerId: 'provider-1', name: 'La tiendita' },
        'trace-1',
      );

      expect(result).toBe(existing);
      expect(trustSafety.checkVerificationValid).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('refuses to open a storefront without a valid verification', async () => {
      storefronts.findOne.mockResolvedValue(null);
      trustSafety.checkVerificationValid.mockResolvedValue({
        valid: false,
        expiresAt: new Date(),
      });

      await expect(
        manager.openStorefront(
          { providerId: 'provider-1', name: 'La tiendita' },
          'trace-1',
        ),
      ).rejects.toThrow(TrustSafetyVerificationRequiredError);
    });
  });

  describe('addProduct', () => {
    it('lists a product when the requester owns the storefront', async () => {
      const storefront = makeStorefront();
      storefronts.findOne.mockResolvedValue(storefront);

      const product = await manager.addProduct({
        storefrontId: storefront.id,
        requestedBy: 'provider-1',
        name: 'Premios de pollo',
        priceAmount: 800,
        priceCurrency: 'USD',
        category: 'treat',
      });

      expect(product.name).toBe('Premios de pollo');
      expect(products.save).toHaveBeenCalledWith(product);
    });

    it('refuses when the requester does not own the storefront', async () => {
      const storefront = makeStorefront();
      storefronts.findOne.mockResolvedValue(storefront);

      await expect(
        manager.addProduct({
          storefrontId: storefront.id,
          requestedBy: 'someone-else',
          name: 'Premios de pollo',
          priceAmount: 800,
          priceCurrency: 'USD',
          category: 'treat',
        }),
      ).rejects.toThrow(ValidationError);
      expect(products.save).not.toHaveBeenCalled();
    });
  });

  describe('placeOrder', () => {
    const cmd = {
      ownerId: 'owner-1',
      storefrontId: 'storefront-1',
      paymentMethodId: 'pm-1',
      idempotencyKey: 'idem-1',
      lines: [{ productId: 'product-1', quantity: 2 }],
    };

    function setupHappyPath() {
      const storefront = makeStorefront();
      const product = makeProduct(10);
      product.id = 'product-1';
      orders.findOne.mockResolvedValue(null);
      storefronts.findOne.mockResolvedValue(storefront);
      products.find.mockResolvedValue([product]);
      return { storefront, product };
    }

    it('charges the card, reserves stock, and persists a Paid order', async () => {
      setupHappyPath();

      const order = await manager.placeOrder(cmd, 'trace-1');

      expect(payments.chargeOrder).toHaveBeenCalledWith(
        expect.objectContaining({ paymentMethodId: 'pm-1' }),
      );
      expect(order.status).toBe(OrderStatus.Paid);
      expect(order.total.equals(Money.of(1600, 'USD'))).toBe(true);
      expect(txManagerSave).toHaveBeenCalledWith(
        Product,
        expect.arrayContaining([expect.objectContaining({ stockQuantity: 8 })]),
      );
      expect(txManagerSave).toHaveBeenCalledWith(Order, expect.any(Order));
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'OrderPaid' }),
      );
    });

    it('is idempotent: replays the same Order on a repeated idempotency key', async () => {
      const existing = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      orders.findOne.mockResolvedValue(existing);

      const result = await manager.placeOrder(cmd, 'trace-1');

      expect(result).toBe(existing);
      expect(payments.chargeOrder).not.toHaveBeenCalled();
    });

    it('attaches a delivery booking when one is already confirmed', async () => {
      setupHappyPath();
      requiresUpcomingBooking.findDeliveryBooking.mockResolvedValue(
        'booking-1',
      );

      const order = await manager.placeOrder(cmd, 'trace-1');

      expect(order.status).toBe(OrderStatus.AwaitingDelivery);
      expect(order.deliveryBookingId).toBe('booking-1');
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'OrderAwaitingDelivery' }),
      );
    });

    it('leaves the order Paid (no booking yet) when none is confirmed', async () => {
      setupHappyPath();

      const order = await manager.placeOrder(cmd, 'trace-1');

      expect(order.status).toBe(OrderStatus.Paid);
      expect(order.deliveryBookingId).toBeNull();
    });

    it('rejects when stock is insufficient, before ever charging the card', async () => {
      const storefront = makeStorefront();
      const product = makeProduct(1);
      product.id = 'product-1';
      orders.findOne.mockResolvedValue(null);
      storefronts.findOne.mockResolvedValue(storefront);
      products.find.mockResolvedValue([product]);

      await expect(manager.placeOrder(cmd, 'trace-1')).rejects.toThrow(
        InsufficientStockError,
      );
      expect(payments.chargeOrder).not.toHaveBeenCalled();
    });

    it('never persists anything when the card is declined', async () => {
      setupHappyPath();
      payments.chargeOrder.mockResolvedValue({
        transactionId: 'tx-1',
        status: 'failed',
      });

      await expect(manager.placeOrder(cmd, 'trace-1')).rejects.toThrow(
        PaymentCardDeclinedError,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('attachDeliveryBooking', () => {
    it('links the order once a confirmed booking exists', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      orders.findOne.mockResolvedValue(order);
      requiresUpcomingBooking.assertDeliveryBooking.mockResolvedValue(
        'booking-1',
      );

      const result = await manager.attachDeliveryBooking(order.id, 'trace-1');

      expect(result.status).toBe(OrderStatus.AwaitingDelivery);
      expect(
        requiresUpcomingBooking.assertDeliveryBooking,
      ).toHaveBeenCalledWith('owner-1', 'provider-1');
    });

    it('propagates NoUpcomingBookingError when none exists yet', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      orders.findOne.mockResolvedValue(order);
      requiresUpcomingBooking.assertDeliveryBooking.mockRejectedValue(
        new NoUpcomingBookingError('sin paseo agendado'),
      );

      await expect(
        manager.attachDeliveryBooking(order.id, 'trace-1'),
      ).rejects.toThrow(NoUpcomingBookingError);
    });
  });

  describe('confirmDelivery', () => {
    it('confirms once the delivery window is open', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      order.attachDeliveryBooking('booking-1');
      order.openDeliveryWindow();
      orders.findOne.mockResolvedValue(order);

      const result = await manager.confirmDelivery(
        order.id,
        'provider-1',
        'trace-1',
      );

      expect(result.status).toBe(OrderStatus.Delivered);
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'OrderDelivered' }),
      );
    });

    it('refuses when the delivery window has not opened yet', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      order.attachDeliveryBooking('booking-1');
      orders.findOne.mockResolvedValue(order);

      await expect(
        manager.confirmDelivery(order.id, 'provider-1', 'trace-1'),
      ).rejects.toThrow(OrderDeliveryNotReadyError);
    });

    it("refuses when the caller is not this order's walker", async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      orders.findOne.mockResolvedValue(order);

      await expect(
        manager.confirmDelivery(order.id, 'someone-else', 'trace-1'),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('cancelOrder', () => {
    it('refunds the charge and restocks the products', async () => {
      const product = makeProduct(5);
      product.id = 'product-1';
      const line = OrderLineItem.from(
        {
          id: 'product-1',
          name: 'Premios de pollo',
          price: Money.of(800, 'USD'),
        },
        2,
      );
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [line],
        total: Money.of(1600, 'USD'),
      });
      order.markPaid();
      orders.findOne.mockResolvedValue(order);
      products.find.mockResolvedValue([product]);

      const result = await manager.cancelOrder(order.id, 'owner-1', 'trace-1');

      expect(result.status).toBe(OrderStatus.Refunded);
      expect(payments.refundOrder).toHaveBeenCalled();
      expect(txManagerSave).toHaveBeenCalledWith(
        Product,
        expect.arrayContaining([expect.objectContaining({ stockQuantity: 7 })]),
      );
      expect(txManagerSave).toHaveBeenCalledWith(
        OutboxEvent,
        expect.objectContaining({ eventType: 'OrderRefunded' }),
      );
    });

    it('refuses when the caller is neither the owner nor the provider', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      orders.findOne.mockResolvedValue(order);

      await expect(
        manager.cancelOrder(order.id, 'someone-else', 'trace-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('refuses to cancel an already-delivered order', async () => {
      const order = Order.place({
        ownerId: 'owner-1',
        storefrontId: 'storefront-1',
        providerId: 'provider-1',
        idempotencyKey: 'idem-1',
        lines: [],
        total: Money.zero('USD'),
      });
      order.markPaid();
      order.attachDeliveryBooking('booking-1');
      order.openDeliveryWindow();
      order.confirmDelivered();
      orders.findOne.mockResolvedValue(order);

      await expect(
        manager.cancelOrder(order.id, 'owner-1', 'trace-1'),
      ).rejects.toThrow(ValidationError);
      expect(payments.refundOrder).not.toHaveBeenCalled();
    });
  });
});
