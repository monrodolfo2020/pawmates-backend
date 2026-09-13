import { InsufficientStockError, Money, ValidationError } from '@pawmates/common';
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

// Every product needs at least one photo — but a product listed before
// this shipped (the initial 100-item catalog seed) has none yet, so
// `photos: []` stays valid as a legacy/transitional state. Only a
// *nonzero* count is held to the 1-6 range.
const MIN_PHOTOS = 1;
const MAX_PHOTOS = 6;

function assertPhotosValid(photos: string[]): void {
  if (photos.length === 0) return;
  if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) {
    throw new ValidationError(
      `Un producto necesita entre ${MIN_PHOTOS} y ${MAX_PHOTOS} fotos.`,
    );
  }
}

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
@Entity({ name: 'commerce_products' })
export class Product {
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'storefront_id', type: 'text' })
  storefrontId!: string;

  // The CatalogItem this was listed from — name/description/category are
  // snapshotted onto this row at creation (see AddProductCatalog
  // migration), so this is provenance, not a live reference to re-read.
  @Column({ name: 'catalog_item_id', type: 'text', nullable: true })
  catalogItemId!: string | null;

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

  @Column({ name: 'price_currency', type: 'text' })
  priceCurrency!: string;

  @Column({ name: 'stock_quantity', type: 'int', nullable: true })
  stockQuantity!: number | null;

  @Column({ type: 'text' })
  category!: ProductCategory;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  // Base64 data URLs, same tradeoff as every other photo field in this
  // app (see README's Identity section) — stored as a JSON array via
  // TypeORM's simple-json, same convention as Pet.temperament.
  @Column({ name: 'photos_base64', type: 'simple-json', default: '[]' })
  photos!: string[];

  @VersionColumn()
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  get price(): Money {
    return Money.of(this.priceAmount, this.priceCurrency);
  }

  static list(params: {
    storefrontId: string;
    catalogItemId?: string | null;
    name: string;
    description?: string | null;
    price: Money;
    stockQuantity?: number | null;
    category: ProductCategory;
    photos?: string[];
  }): Product {
    const photos = params.photos ?? [];
    assertPhotosValid(photos);
    const product = new Product();
    product.id = ulid().toLowerCase();
    product.storefrontId = params.storefrontId;
    product.catalogItemId = params.catalogItemId ?? null;
    product.name = params.name;
    product.description = params.description ?? null;
    product.priceAmount = params.price.amount;
    product.priceCurrency = params.price.currency;
    product.stockQuantity = params.stockQuantity ?? null;
    product.category = params.category;
    product.isActive = true;
    product.photos = photos;
    return product;
  }

  updateDetails(params: {
    name?: string;
    description?: string | null;
    price?: Money;
    stockQuantity?: number | null;
    isActive?: boolean;
    photos?: string[];
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
    if (params.photos !== undefined) {
      assertPhotosValid(params.photos);
      this.photos = params.photos;
    }
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
