import { Money } from '@pawmates/common';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { bigintTransformer } from './bigint.transformer';

/**
 * OrderLineItem — one row per Product in an Order, with the name/price
 * frozen at purchase time (Domain Model precedent, PriceBreakdown: "el
 * precio reservado es el precio pagado" — a later price or name change on
 * the Product must never alter a past Order).
 */
@Entity({ name: 'order_line_items', schema: 'commerce' })
export class OrderLineItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'text' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'product_id', type: 'text' })
  productId!: string;

  @Column({ name: 'name_snapshot', type: 'text' })
  nameSnapshot!: string;

  @Column({
    name: 'unit_price_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  unitPriceAmount!: number;

  @Column({ name: 'unit_price_currency', type: 'char', length: 3 })
  unitPriceCurrency!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    name: 'line_total_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  lineTotalAmount!: number;

  get unitPrice(): Money {
    return Money.of(this.unitPriceAmount, this.unitPriceCurrency);
  }

  get lineTotal(): Money {
    return Money.of(this.lineTotalAmount, this.unitPriceCurrency);
  }

  static from(
    product: {
      id: string;
      name: string;
      price: Money;
    },
    quantity: number,
  ): OrderLineItem {
    const line = new OrderLineItem();
    line.productId = product.id;
    line.nameSnapshot = product.name;
    line.unitPriceAmount = product.price.amount;
    line.unitPriceCurrency = product.price.currency;
    line.quantity = quantity;
    line.lineTotalAmount = product.price.multiply(quantity).amount;
    return line;
  }
}
