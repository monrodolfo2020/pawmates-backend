import { Money } from '@pawmates/common';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { ProductCategory } from './product.entity';
import { bigintTransformer } from './bigint.transformer';

/**
 * CatalogItem — the admin-curated master list a provider picks from when
 * listing a Product (see AddProductCatalog migration for why: no more
 * free-text product creation). Not an aggregate with behavior of its own,
 * just reference data — the admin panel edits it directly via repository
 * calls, no saga needed.
 */
@Entity({ name: 'commerce_catalog_items' })
export class CatalogItem {
  @PrimaryColumn('text')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text' })
  category!: ProductCategory;

  @Column({
    name: 'suggested_price_amount',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  suggestedPriceAmount!: number;

  @Column({ name: 'suggested_price_currency', type: 'text' })
  suggestedPriceCurrency!: string;

  // Base64, same tradeoff as Pet/ProviderVerification photos (see README) —
  // starts NULL; the admin panel fills it in after this ships.
  @Column({ name: 'photo_base64', type: 'text', nullable: true })
  photoBase64!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  get suggestedPrice(): Money {
    return Money.of(this.suggestedPriceAmount, this.suggestedPriceCurrency);
  }
}
