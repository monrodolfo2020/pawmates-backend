import { Money, ValidationError } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ulid } from 'ulid';
import { bigintTransformer } from './bigint.transformer';

const MAX_BIO_LENGTH = 600;
const MAX_SHORT_FIELD_LENGTH = 120;

function assertBioValid(bio: string): void {
  if (bio.length === 0 || bio.length > MAX_BIO_LENGTH) {
    throw new ValidationError(
      `La biografía debe tener entre 1 y ${MAX_BIO_LENGTH} caracteres.`,
    );
  }
}

function assertShortFieldValid(label: string, value: string): void {
  if (value.length === 0 || value.length > MAX_SHORT_FIELD_LENGTH) {
    throw new ValidationError(
      `${label} debe tener entre 1 y ${MAX_SHORT_FIELD_LENGTH} caracteres.`,
    );
  }
}

/**
 * ProviderProfile — the real, editable public-facing page for a
 * paseador's own account (Marketplace bounded context, formerly stubbed
 * out entirely by an always-available fake in-process adapter). One per
 * provider account (`accountId` unique).
 *
 * `isPublished` is never set directly by a caller — it's derived every
 * time `update()` runs, from whether the two fields a shopper actually
 * needs to book (bio + price) are both present. That keeps "am I visible
 * in the directory yet" a fact about the data, not a separate toggle a
 * provider could leave stale (published with an empty bio, or hidden
 * despite a complete profile).
 */
@Entity({ name: 'providers_profiles' })
export class ProviderProfile {
  // A ULID, not an RFC-4122 UUID — same convention as Booking.id/Product.id.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'account_id', type: 'text', unique: true })
  accountId!: string;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ name: 'service_area', type: 'text', nullable: true })
  serviceArea!: string | null;

  @Column({ type: 'text', nullable: true })
  specialty!: string | null;

  @Column({ name: 'photo_base64', type: 'text', nullable: true })
  photoBase64!: string | null;

  @Column({
    name: 'price_amount',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  priceAmount!: number | null;

  @Column({ name: 'price_currency', type: 'text', nullable: true })
  priceCurrency!: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  get price(): Money | null {
    return this.priceAmount !== null
      ? Money.of(this.priceAmount, this.priceCurrency!)
      : null;
  }

  static draft(accountId: string): ProviderProfile {
    const profile = new ProviderProfile();
    profile.id = ulid().toLowerCase();
    profile.accountId = accountId;
    profile.bio = null;
    profile.serviceArea = null;
    profile.specialty = null;
    profile.photoBase64 = null;
    profile.priceAmount = null;
    profile.priceCurrency = null;
    profile.isPublished = false;
    return profile;
  }

  update(params: {
    bio?: string | null;
    serviceArea?: string | null;
    specialty?: string | null;
    photo?: string | null;
    price?: Money | null;
  }): void {
    if (params.bio !== undefined) {
      if (params.bio !== null) assertBioValid(params.bio);
      this.bio = params.bio;
    }
    if (params.serviceArea !== undefined) {
      if (params.serviceArea !== null) {
        assertShortFieldValid('La zona de servicio', params.serviceArea);
      }
      this.serviceArea = params.serviceArea;
    }
    if (params.specialty !== undefined) {
      if (params.specialty !== null) {
        assertShortFieldValid('La especialidad', params.specialty);
      }
      this.specialty = params.specialty;
    }
    if (params.photo !== undefined) this.photoBase64 = params.photo;
    if (params.price !== undefined) {
      this.priceAmount = params.price?.amount ?? null;
      this.priceCurrency = params.price?.currency ?? null;
    }
    this.isPublished = Boolean(this.bio && this.priceAmount !== null);
  }
}
