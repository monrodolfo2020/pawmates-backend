import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';

/**
 * Storefront — aggregate root. One single platform-wide store (not one
 * per paseador — that was this project's original design, replaced when
 * the owner decided a single unified store with a shared catalog/
 * inventory made more sense than each walker running their own shop);
 * CommerceProcessManager.openStorefront() enforces that singleton by
 * refusing to create a second row regardless of who asks.
 *
 * `providerId` is a holdover from the per-walker design — it's just
 * whichever admin account created the store now, with no bearing on
 * delivery eligibility. Delivery routes through whichever walker the
 * owner's own next confirmed Booking happens to be with (see
 * RequiresUpcomingBookingPolicy and Order.attachDeliveryBooking), not
 * through this field.
 */
@Entity({ name: 'commerce_storefronts' })
export class Storefront {
  // A ULID, not an RFC-4122 UUID — same convention as Booking.id.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'provider_id', type: 'text', unique: true })
  providerId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
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
