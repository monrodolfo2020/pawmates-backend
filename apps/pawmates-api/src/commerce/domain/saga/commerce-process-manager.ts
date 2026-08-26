import {
  EVENT_TOPICS,
  Money,
  PaymentCardDeclinedError,
  ResourceNotFoundError,
  TrustSafetyVerificationRequiredError,
  ValidationError,
} from '@pawmates/common';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ulid } from 'ulid';
import { Order } from '../entities/order.entity';
import { OrderLineItem } from '../entities/order-line-item.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { Product } from '../entities/product.entity';
import { Storefront } from '../entities/storefront.entity';
import { OrderStatus } from '../value-objects/order-status';
import { PAYMENTS_PORT } from '../ports/payments.port';
import type { PaymentsPort } from '../ports/payments.port';
import { TRUST_SAFETY_PORT } from '../ports/trust-safety.port';
import type { TrustSafetyPort } from '../ports/trust-safety.port';
import { RequiresUpcomingBookingPolicy } from '../policies/requires-upcoming-booking.policy';
import type {
  AddProductCommand,
  OpenStorefrontCommand,
  PlaceOrderCommand,
} from './commands';

/**
 * CommerceProcessManager — the saga orchestrator for PawMates Commerce
 * (walker storefronts), mirroring BookingProcessManager's shape: every
 * step that touches this service's own database and enqueues a domain
 * event does so inside one transaction; every synchronous cross-context
 * call (trust-safety, payments, booking) happens first, so a failure
 * there never leaves a half-written row behind.
 */
@Injectable()
export class CommerceProcessManager {
  private readonly logger = new Logger(CommerceProcessManager.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Storefront)
    private readonly storefronts: Repository<Storefront>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @Inject(TRUST_SAFETY_PORT) private readonly trustSafety: TrustSafetyPort,
    @Inject(PAYMENTS_PORT) private readonly payments: PaymentsPort,
    private readonly requiresUpcomingBooking: RequiresUpcomingBookingPolicy,
  ) {}

  async openStorefront(
    cmd: OpenStorefrontCommand,
    traceId: string,
  ): Promise<Storefront> {
    const existing = await this.storefronts.findOne({
      where: { providerId: cmd.providerId },
    });
    if (existing) return existing; // one storefront per provider — idempotent by construction

    const verification = await this.trustSafety.checkVerificationValid({
      accountId: cmd.providerId,
      requiredLevel: 'basic',
    });
    if (!verification.valid) {
      throw new TrustSafetyVerificationRequiredError(
        'Necesitas una verificación vigente para abrir tu tienda.',
      );
    }

    const storefront = Storefront.open(cmd);
    await this.dataSource.transaction(async (manager) => {
      await manager.save(Storefront, storefront);
      await this.enqueue(manager, storefront.id, 'StorefrontOpened', traceId, {
        storefrontId: storefront.id,
        providerId: storefront.providerId,
      });
    });
    return storefront;
  }

  async addProduct(cmd: AddProductCommand): Promise<Product> {
    const storefront = await this.loadStorefrontOrThrow(cmd.storefrontId);
    if (storefront.providerId !== cmd.requestedBy) {
      throw new ValidationError('Esta no es tu tienda.');
    }

    const product = Product.list({
      storefrontId: storefront.id,
      name: cmd.name,
      description: cmd.description,
      price: Money.of(cmd.priceAmount, cmd.priceCurrency),
      stockQuantity: cmd.stockQuantity,
      category: cmd.category,
    });
    await this.products.save(product);
    return product;
  }

  async updateProduct(
    productId: string,
    requestedBy: string,
    updates: {
      name?: string;
      description?: string | null;
      priceAmount?: number;
      priceCurrency?: string;
      stockQuantity?: number | null;
      isActive?: boolean;
    },
  ): Promise<Product> {
    const product = await this.loadProductOrThrow(productId);
    const storefront = await this.loadStorefrontOrThrow(product.storefrontId);
    if (storefront.providerId !== requestedBy) {
      throw new ValidationError('Este producto no es tuyo.');
    }

    product.updateDetails({
      name: updates.name,
      description: updates.description,
      price:
        updates.priceAmount !== undefined
          ? Money.of(
              updates.priceAmount,
              updates.priceCurrency ?? product.priceCurrency,
            )
          : undefined,
      stockQuantity: updates.stockQuantity,
      isActive: updates.isActive,
    });
    await this.products.save(product);
    return product;
  }

  /**
   * Validates the cart, reserves stock, and charges the card — all before
   * the Order is ever persisted (Architecture precedent: fail fast, don't
   * touch this service's own database until every synchronous check has
   * passed). If a confirmed future Booking with this provider already
   * exists, the Order is linked for delivery in the same transaction;
   * otherwise it's left Paid, and the owner books a walk and calls
   * POST /v1/orders/:id/attach-delivery-booking afterward.
   */
  async placeOrder(cmd: PlaceOrderCommand, traceId: string): Promise<Order> {
    const existing = await this.orders.findOne({
      where: { ownerId: cmd.ownerId, idempotencyKey: cmd.idempotencyKey },
      relations: ['lines'],
    });
    if (existing) return existing; // Idempotency-Key replay

    if (!cmd.lines.length) {
      throw new ValidationError('El carrito necesita al menos un producto.');
    }

    const storefront = await this.loadStorefrontOrThrow(cmd.storefrontId);
    if (!storefront.isActive) {
      throw new ValidationError('Esta tienda no está activa.');
    }

    const productIds = cmd.lines.map((l) => l.productId);
    const products = await this.products.find({
      where: { id: In(productIds), storefrontId: storefront.id },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    const orderLines: OrderLineItem[] = [];
    for (const line of cmd.lines) {
      const product = byId.get(line.productId);
      if (!product || !product.isActive) {
        throw new ResourceNotFoundError(
          `Producto ${line.productId} no existe en esta tienda.`,
        );
      }
      if (line.quantity < 1) {
        throw new ValidationError('La cantidad debe ser al menos 1.');
      }
      product.reserveStock(line.quantity); // throws InsufficientStockError, in-memory only so far
      orderLines.push(OrderLineItem.from(product, line.quantity));
    }

    const total = orderLines.reduce(
      (sum, line) => sum.add(line.lineTotal),
      Money.zero(orderLines[0].unitPriceCurrency),
    );

    const order = Order.place({
      ownerId: cmd.ownerId,
      storefrontId: storefront.id,
      providerId: storefront.providerId,
      idempotencyKey: cmd.idempotencyKey,
      lines: orderLines,
      total,
    });

    const charge = await this.payments.chargeOrder({
      orderId: order.id,
      amount: total,
      paymentMethodId: cmd.paymentMethodId,
      idempotencyKey: `place:${order.id}`,
    });
    if (charge.status !== 'captured') {
      throw new PaymentCardDeclinedError('No se pudo cobrar el pedido.');
    }
    order.markPaid();

    const deliveryBookingId =
      await this.requiresUpcomingBooking.findDeliveryBooking(
        cmd.ownerId,
        storefront.providerId,
      );
    if (deliveryBookingId) order.attachDeliveryBooking(deliveryBookingId);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Product, products); // persist each reserveStock() decrement
      await manager.save(Order, order);
      await this.enqueue(manager, order.id, 'OrderPaid', traceId, {
        orderId: order.id,
        storefrontId: storefront.id,
        totalAmount: total.amount,
        totalCurrency: total.currency,
      });
      if (deliveryBookingId) {
        await this.enqueue(
          manager,
          order.id,
          'OrderAwaitingDelivery',
          traceId,
          { orderId: order.id, bookingId: deliveryBookingId },
        );
      }
    });

    return order;
  }

  /** Owner retries linking a delivery Booking after booking a walk post-purchase. */
  async attachDeliveryBooking(
    orderId: string,
    traceId: string,
  ): Promise<Order> {
    const order = await this.loadOrderOrThrow(orderId);
    if (order.status !== OrderStatus.Paid) {
      throw new ValidationError('Este pedido ya tiene entrega asignada.');
    }

    const bookingId = await this.requiresUpcomingBooking.assertDeliveryBooking(
      order.ownerId,
      order.providerId,
    );
    order.attachDeliveryBooking(bookingId);

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Order, order);
      await this.enqueue(manager, order.id, 'OrderAwaitingDelivery', traceId, {
        orderId: order.id,
        bookingId,
      });
    });
    return order;
  }

  /** Reacts to booking.events/WalkFinished — see infra/messaging/booking-events.consumer.ts. */
  async openDeliveryWindowForBooking(bookingId: string): Promise<void> {
    const pending = await this.orders.find({
      where: {
        deliveryBookingId: bookingId,
        status: OrderStatus.AwaitingDelivery,
      },
    });
    for (const order of pending) {
      order.openDeliveryWindow();
      await this.orders.save(order);
    }
  }

  /** Walker confirms hand-off — never inferred automatically from GPS. */
  async confirmDelivery(
    orderId: string,
    walkerId: string,
    traceId: string,
  ): Promise<Order> {
    const order = await this.loadOrderOrThrow(orderId);
    if (order.providerId !== walkerId) {
      throw new ValidationError('Este pedido no está en tu tienda.');
    }
    order.confirmDelivered();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Order, order);
      await this.enqueue(manager, order.id, 'OrderDelivered', traceId, {
        orderId: order.id,
      });
    });
    return order;
  }

  /** Owner or provider cancels a not-yet-delivered Order — always a refund. */
  async cancelOrder(
    orderId: string,
    cancelledBy: string,
    traceId: string,
  ): Promise<Order> {
    const order = await this.loadOrderOrThrow(orderId, ['lines']);
    if (order.ownerId !== cancelledBy && order.providerId !== cancelledBy) {
      throw new ValidationError('No puedes cancelar este pedido.');
    }
    if (
      order.status !== OrderStatus.Paid &&
      order.status !== OrderStatus.AwaitingDelivery
    ) {
      throw new ValidationError('Este pedido ya no se puede cancelar.');
    }

    await this.payments.refundOrder({
      transactionId: `charge:${order.id}`, // reference implementation: see payments-svc stub
      amount: order.total,
    });

    const productIds = order.lines.map((l) => l.productId);
    const products = await this.products.find({
      where: { id: In(productIds) },
    });
    const quantityByProduct = new Map(
      order.lines.map((l) => [l.productId, l.quantity]),
    );
    for (const product of products) {
      product.restock(quantityByProduct.get(product.id) ?? 0);
    }

    order.refund();

    await this.dataSource.transaction(async (manager) => {
      await manager.save(Product, products);
      await manager.save(Order, order);
      await this.enqueue(manager, order.id, 'OrderRefunded', traceId, {
        orderId: order.id,
        cancelledBy,
      });
    });
    return order;
  }

  private async loadStorefrontOrThrow(id: string): Promise<Storefront> {
    const storefront = await this.storefronts.findOne({ where: { id } });
    if (!storefront) {
      throw new ResourceNotFoundError(`Storefront ${id} no existe.`);
    }
    return storefront;
  }

  private async loadProductOrThrow(id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) {
      throw new ResourceNotFoundError(`Product ${id} no existe.`);
    }
    return product;
  }

  private async loadOrderOrThrow(
    id: string,
    relations: string[] = [],
  ): Promise<Order> {
    const order = await this.orders.findOne({ where: { id }, relations });
    if (!order) {
      throw new ResourceNotFoundError(`Order ${id} no existe.`);
    }
    return order;
  }

  private async enqueue(
    manager: EntityManager,
    partitionKey: string,
    eventType: string,
    traceId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event = new OutboxEvent();
    event.id = ulid().toLowerCase();
    event.topic = EVENT_TOPICS.commerce;
    event.eventType = eventType;
    event.partitionKey = partitionKey;
    event.payload = payload;
    event.traceId = traceId;
    await manager.save(OutboxEvent, event);
    this.logger.log(`Enqueued ${eventType} for ${partitionKey}`);
  }
}
