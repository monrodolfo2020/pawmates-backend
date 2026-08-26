import { Money, OrderDeliveryNotReadyError } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { OrderLineItem } from './order-line-item.entity';
import { OrderStatus, canTransition } from '../value-objects/order-status';
import { bigintTransformer } from './bigint.transformer';

/**
 * Order — the aggregate root with real behavior (Booking's counterpart in
 * this Bounded Context). See OrderStatus for the state machine; behavior
 * lives here so an invalid transition is caught by the entity itself, not
 * something the process manager has to remember to check.
 */
@Entity({ name: 'orders', schema: 'commerce' })
export class Order {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'storefront_id', type: 'text' })
  storefrontId!: string;

  // Denormalized from Storefront at order time — lets OrderController list
  // "orders on my storefront" without a join, same rationale as Booking
  // denormalizing providerId onto every line.
  @Column({ name: 'provider_id', type: 'uuid' })
  providerId!: string;

  @Column({ type: 'text' })
  status!: OrderStatus;

  @Column({ name: 'delivery_booking_id', type: 'uuid', nullable: true })
  deliveryBookingId!: string | null;

  // Set when booking-svc reports (via booking.events/WalkFinished) that the
  // linked walk has finished — only then can the walker confirm delivery.
  @Column({
    name: 'delivery_window_open_at',
    type: 'timestamptz',
    nullable: true,
  })
  deliveryWindowOpenAt!: Date | null;

  @Column({
    name: 'total_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  totalAmount!: number;

  @Column({ name: 'total_currency', type: 'char', length: 3 })
  totalCurrency!: string;

  @Column({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamptz', nullable: true })
  refundedAt!: Date | null;

  @OneToMany(() => OrderLineItem, (line) => line.order, { cascade: true })
  lines!: OrderLineItem[];

  get total(): Money {
    return Money.of(this.totalAmount, this.totalCurrency);
  }

  /**
   * Charged in full at checkout (unlike Booking, authorized at accept) —
   * so an Order only starts existing, as far as persistence is concerned,
   * once payment has already succeeded. See
   * CommerceProcessManager.placeOrder(): PendingPayment is a transient
   * in-memory state during that call, never actually written.
   */
  static place(params: {
    ownerId: string;
    storefrontId: string;
    providerId: string;
    idempotencyKey: string;
    lines: OrderLineItem[];
    total: Money;
  }): Order {
    const order = new Order();
    order.id = ulid().toLowerCase();
    order.ownerId = params.ownerId;
    order.storefrontId = params.storefrontId;
    order.providerId = params.providerId;
    order.idempotencyKey = params.idempotencyKey;
    order.status = OrderStatus.PendingPayment;
    order.deliveryBookingId = null;
    order.deliveryWindowOpenAt = null;
    order.totalAmount = params.total.amount;
    order.totalCurrency = params.total.currency;
    order.paidAt = null;
    order.deliveredAt = null;
    order.refundedAt = null;
    order.lines = params.lines;
    return order;
  }

  private transitionTo(next: OrderStatus): void {
    if (!canTransition(this.status, next)) {
      throw new Error(
        `Invalid Order transition: ${this.status} -> ${next} (id=${this.id})`,
      );
    }
    this.status = next;
  }

  markPaid(): void {
    this.transitionTo(OrderStatus.Paid);
    this.paidAt = new Date();
  }

  /** RequiresUpcomingBookingPolicy found a confirmed future Booking to deliver on. */
  attachDeliveryBooking(bookingId: string): void {
    this.transitionTo(OrderStatus.AwaitingDelivery);
    this.deliveryBookingId = bookingId;
  }

  /** booking.events/WalkFinished for this Order's linked Booking. */
  openDeliveryWindow(): void {
    this.deliveryWindowOpenAt = new Date();
  }

  /** Explicit walker confirmation — never inferred from GPS/trip state alone. */
  confirmDelivered(): void {
    if (!this.deliveryWindowOpenAt) {
      throw new OrderDeliveryNotReadyError(
        'Aún no puedes confirmar la entrega — el paseo todavía no termina.',
      );
    }
    this.transitionTo(OrderStatus.Delivered);
    this.deliveredAt = new Date();
  }

  /** Owner or provider cancels before delivery — always a refund, since
   * payment already happened synchronously at checkout. */
  refund(): void {
    this.transitionTo(OrderStatus.Refunded);
    this.refundedAt = new Date();
  }
}
