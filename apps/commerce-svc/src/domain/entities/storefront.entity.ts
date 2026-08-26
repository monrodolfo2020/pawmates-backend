import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

/**
 * Storefront — aggregate root, one per provider (walker) who has opened
 * their own mini-shop (PawMates Commerce design: "tienda propia por
 * paseador", not a PawMates-curated catalog). Opening one requires a
 * valid trust-safety verification, checked by
 * CommerceProcessManager.openStorefront() before this is ever
 * constructed — this entity itself doesn't reach out to another Bounded
 * Context, same discipline as Booking.
 */
@Entity({ name: 'storefronts', schema: 'commerce' })
export class Storefront {
  // A ULID, not an RFC-4122 UUID — same convention as Booking.id.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'provider_id', type: 'uuid', unique: true })
  providerId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  static open(params: {
    providerId: string;
    name: string;
    description?: string | null;
  }): Storefront {
    const storefront = new Storefront();
    storefront.id = ulid().toLowerCase();
    storefront.providerId = params.providerId;
    storefront.name = params.name;
    storefront.description = params.description ?? null;
    storefront.isActive = true;
    return storefront;
  }

  deactivate(): void {
    this.isActive = false;
  }

  activate(): void {
    this.isActive = true;
  }
}
