import { InsufficientStockError, Money } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { bigintTransformer } from './bigint.transformer';

export type ProductCategory =
  'treat' | 'toy' | 'accessory' | 'service_addon' | 'other';

/**
 * Product — its own aggregate root rather than nested inside Storefront
 * (Data Model doc convention: an aggregate a checkout needs to lock
 * shouldn't force loading its parent). `stockQuantity: null` means
 * unlimited (e.g. a service add-on with no physical inventory).
 * `@VersionColumn` gives every stock decrement an optimistic lock, so two
 * concurrent orders can't both succeed against the last unit — the loser
 * gets a stale-write error from TypeORM/Postgres, and the saga surfaces
 * that as InsufficientStockError on retry.
 */
@Entity({ name: 'products', schema: 'commerce' })
export class Product {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'storefront_id', type: 'text' })
  storefrontId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    name: 'price_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  priceAmount!: number;

  @Column({ name: 'price_currency', type: 'char', length: 3 })
  priceCurrency!: string;

  @Column({ name: 'stock_quantity', type: 'int', nullable: true })
  stockQuantity!: number | null;

  @Column({ type: 'text' })
  category!: ProductCategory;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  get price(): Money {
    return Money.of(this.priceAmount, this.priceCurrency);
  }

  static list(params: {
    storefrontId: string;
    name: string;
    description?: string | null;
    price: Money;
    stockQuantity?: number | null;
    category: ProductCategory;
  }): Product {
    const product = new Product();
    product.id = ulid().toLowerCase();
    product.storefrontId = params.storefrontId;
    product.name = params.name;
    product.description = params.description ?? null;
    product.priceAmount = params.price.amount;
    product.priceCurrency = params.price.currency;
    product.stockQuantity = params.stockQuantity ?? null;
    product.category = params.category;
    product.isActive = true;
    return product;
  }

  updateDetails(params: {
    name?: string;
    description?: string | null;
    price?: Money;
    stockQuantity?: number | null;
    isActive?: boolean;
  }): void {
    if (params.name !== undefined) this.name = params.name;
    if (params.description !== undefined) this.description = params.description;
    if (params.price !== undefined) {
      this.priceAmount = params.price.amount;
      this.priceCurrency = params.price.currency;
    }
    if (params.stockQuantity !== undefined)
      this.stockQuantity = params.stockQuantity;
    if (params.isActive !== undefined) this.isActive = params.isActive;
  }

  /** Unlimited stock (`null`) never blocks a purchase. */
  reserveStock(quantity: number): void {
    if (this.stockQuantity === null) return;
    if (this.stockQuantity < quantity) {
      throw new InsufficientStockError(
        `No hay suficiente stock de "${this.name}".`,
      );
    }
    this.stockQuantity -= quantity;
  }

  restock(quantity: number): void {
    if (this.stockQuantity === null) return;
    this.stockQuantity += quantity;
  }
}
