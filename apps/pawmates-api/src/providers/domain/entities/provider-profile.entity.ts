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
import {
  DEFAULT_SERVICE_CATEGORY,
  SERVICE_CATEGORIES,
  requiresRate,
} from '../value-objects/service-category';
import type { ServiceCategory } from '../value-objects/service-category';
import {
  BUSINESS_PLANS,
  DEFAULT_BUSINESS_PLAN,
} from '../value-objects/business-plan';
import type { BusinessPlan } from '../value-objects/business-plan';
import { assertBillingPeriod, periodEnd } from '../value-objects/billing';
import type { BillingPeriod } from '../value-objects/billing';
import { DEFAULT_PAGE_DESIGN, parsePageDesign } from '../value-objects/page-design';
import type { PageDesign } from '../value-objects/page-design';

const MAX_BIO_LENGTH = 600;
const MAX_SHORT_FIELD_LENGTH = 120;
const MAX_LONG_FIELD_LENGTH = 300;
const MIN_AGE = 18;
const MAX_AGE = 90;
const MAX_PHOTOS = 8;

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

function assertLongFieldValid(label: string, value: string): void {
  if (value.length === 0 || value.length > MAX_LONG_FIELD_LENGTH) {
    throw new ValidationError(
      `${label} debe tener entre 1 y ${MAX_LONG_FIELD_LENGTH} caracteres.`,
    );
  }
}

function assertAgeValid(age: number): void {
  if (!Number.isInteger(age) || age < MIN_AGE || age > MAX_AGE) {
    throw new ValidationError(`La edad debe estar entre ${MIN_AGE} y ${MAX_AGE} años.`);
  }
}

function assertCategoryValid(category: string): asserts category is ServiceCategory {
  if (!SERVICE_CATEGORIES.includes(category as ServiceCategory)) {
    throw new ValidationError('Esa categoría de servicio no existe.');
  }
}

function assertPhotosValid(photos: string[]): void {
  if (photos.length > MAX_PHOTOS) {
    throw new ValidationError(`Puedes subir como máximo ${MAX_PHOTOS} fotos.`);
  }
}

/**
 * ProviderProfile — the real, editable public-facing page for one pet
 * business: its listing in the directory and its shareable micro-page at
 * /s/<slug>. One per provider account (`accountId` unique).
 *
 * Originally walkers-only, hence the walk-specific fields
 * (walkingSpots, the per-walk `price`); `category` generalizes it to the
 * rest of the directory (vets, grooming, boarding…), and only 'walker'
 * still requires a rate, since that's the only category with a booking
 * pipeline behind it — see requiresRate.
 *
 * `isPublished` is never set directly by a caller — it's derived every
 * time `update()` runs, from whether the fields a visitor actually needs
 * are present (name + description, plus a rate for walkers). That keeps
 * "am I visible in the directory yet" a fact about the data, not a
 * separate toggle a provider could leave stale (published with an empty
 * bio, or hidden despite a complete profile). address/idNumber/age/phone
 * don't gate publishing — they're for trust/verification, not required to
 * have a working page — see ProvidersController's comment on why they're
 * never serialized into the public GET responses.
 */
@Entity({ name: 'providers_profiles' })
export class ProviderProfile {
  // A ULID, not an RFC-4122 UUID — same convention as Booking.id/Product.id.
  @PrimaryColumn('text')
  id!: string;

  @Column({ name: 'account_id', type: 'text', unique: true })
  accountId!: string;

  @Column({ type: 'text', default: DEFAULT_SERVICE_CATEGORY })
  category!: ServiceCategory;

  /** What the directory and the micro-page show as the heading. Falls
   * back to the account's own name at signup (see AuthService) so a
   * brand-new business is never nameless. */
  @Column({ name: 'business_name', type: 'text', nullable: true })
  businessName!: string | null;

  /** The shareable /s/<slug> address. Assigned by ProvidersController
   * (which can check the rest of the table for collisions — an entity
   * method never queries the database), never chosen by the business. */
  @Column({ type: 'text', nullable: true, unique: true })
  slug!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  @Column({ name: 'service_area', type: 'text', nullable: true })
  serviceArea!: string | null;

  @Column({ type: 'text', nullable: true })
  specialty!: string | null;

  @Column({ name: 'photo_base64', type: 'text', nullable: true })
  photoBase64!: string | null;

  /** Gallery for the micro-page — hosted URLs, uploaded the same way as
   * photoBase64 (see ProvidersController). Stored as JSON; null on rows
   * that predate the gallery, which `photos` normalizes to []. */
  @Column({ name: 'photos', type: 'simple-json', nullable: true })
  photosJson!: string[] | null;

  @Column({
    name: 'price_amount',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  priceAmount!: number | null;

  @Column({ name: 'price_currency', type: 'text', nullable: true })
  priceCurrency!: string | null;

  // Public — what the provider actually offers/where, not personal data.
  @Column({ name: 'plans_offered', type: 'text', nullable: true })
  plansOffered!: string | null;

  @Column({ name: 'walking_spots', type: 'text', nullable: true })
  walkingSpots!: string | null;

  /** Where customers can show up — a storefront address, unlike the
   * private `address` below (which is the provider's own home address,
   * collected for verification and never published). */
  @Column({ name: 'public_address', type: 'text', nullable: true })
  publicAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  hours!: string | null;

  @Column({ type: 'text', nullable: true })
  whatsapp!: string | null;

  // Private — trust/verification info, never returned from a public
  // endpoint (see ProvidersController's toDirectoryResponse/toDetailResponse).
  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ name: 'id_number', type: 'text', nullable: true })
  idNumber!: string | null;

  @Column({ type: 'int', nullable: true })
  age!: number | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  @Column({ type: 'text', default: DEFAULT_BUSINESS_PLAN })
  plan!: BusinessPlan;

  /** When a paid VIP runs out. null means "doesn't run out": the free
   * plan, and also a VIP an admin granted by hand, which is a courtesy
   * with no billing period behind it (see setPlan). */
  @Column({ name: 'plan_expires_at', type: 'datetime', nullable: true })
  planExpiresAt!: Date | null;

  /** What the business is editing right now. Only reaches the public
   * page once publishDesign() copies it across — the point of the
   * "Diseño" / "En línea" split. */
  @Column({ name: 'design_draft', type: 'simple-json', nullable: true })
  designDraft!: PageDesign | null;

  @Column({ name: 'design_published', type: 'simple-json', nullable: true })
  designPublished!: PageDesign | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt!: Date;

  get price(): Money | null {
    return this.priceAmount !== null
      ? Money.of(this.priceAmount, this.priceCurrency!)
      : null;
  }

  get photos(): string[] {
    return this.photosJson ?? [];
  }

  /** What the design editor opens with: whatever's being drafted, else
   * whatever's live, else PawMates' own defaults. */
  get draftDesign(): PageDesign {
    return this.designDraft ?? this.designPublished ?? DEFAULT_PAGE_DESIGN;
  }

  /**
   * What /s/<slug> actually renders. A free page always gets the fixed
   * PawMates design, even if the business drafted (or once published) a
   * custom one on VIP — downgrading has to take the customization away,
   * not silently keep serving it.
   */
  /**
   * Whether VIP is actually in force right now. Everything that VIP
   * unlocks asks this, never `plan === 'vip'` — a lapsed subscription
   * leaves `plan` alone (so the business keeps its design and a renewal
   * restores it untouched) and simply stops counting.
   */
  isVip(now: Date = new Date()): boolean {
    if (this.plan !== 'vip') return false;
    return this.planExpiresAt === null || this.planExpiresAt.getTime() > now.getTime();
  }

  get effectiveDesign(): PageDesign {
    if (!this.isVip()) return DEFAULT_PAGE_DESIGN;
    return this.designPublished ?? DEFAULT_PAGE_DESIGN;
  }

  get hasUnpublishedDesign(): boolean {
    if (!this.designDraft) return false;
    return JSON.stringify(this.designDraft) !== JSON.stringify(this.designPublished);
  }

  /** The admin panel's manual switch. A hand-granted VIP never expires
   * (there's no period behind it), and dropping to free clears the
   * expiry so a later paid activation starts from a clean slate. */
  setPlan(plan: string): void {
    if (!BUSINESS_PLANS.includes(plan as BusinessPlan)) {
      throw new ValidationError('Ese plan no existe.');
    }
    this.plan = plan as BusinessPlan;
    this.planExpiresAt = null;
  }

  /**
   * Turns on (or renews) a paid VIP. Renewing early stacks onto whatever
   * is left rather than throwing it away — paying again on day 20 of a
   * month has to give you 30 more days, not 10 fewer. A lapsed plan
   * starts over from today instead of backdating to the old expiry.
   */
  activateVip(period: string, now: Date = new Date()): Date {
    assertBillingPeriod(period);
    const startFrom =
      this.planExpiresAt && this.planExpiresAt.getTime() > now.getTime()
        ? this.planExpiresAt
        : now;
    this.plan = 'vip';
    this.planExpiresAt = periodEnd(startFrom, period as BillingPeriod);
    return this.planExpiresAt;
  }

  /** Validates and stores what the business is editing — never touches
   * the live page. Rejected outright on the free plan so a downgraded
   * account can't keep editing a design nobody will see. */
  saveDesignDraft(design: unknown): void {
    this.assertVip();
    this.designDraft = parsePageDesign(design);
  }

  publishDesign(): void {
    this.assertVip();
    this.designPublished = this.designDraft ?? DEFAULT_PAGE_DESIGN;
  }

  private assertVip(): void {
    if (!this.isVip()) {
      throw new ValidationError('Personalizar tu página requiere el plan VIP.');
    }
  }

  static draft(accountId: string): ProviderProfile {
    const profile = new ProviderProfile();
    profile.id = ulid().toLowerCase();
    profile.accountId = accountId;
    profile.category = DEFAULT_SERVICE_CATEGORY;
    profile.businessName = null;
    profile.slug = null;
    profile.photosJson = null;
    profile.publicAddress = null;
    profile.hours = null;
    profile.whatsapp = null;
    profile.bio = null;
    profile.serviceArea = null;
    profile.specialty = null;
    profile.photoBase64 = null;
    profile.priceAmount = null;
    profile.priceCurrency = null;
    profile.plansOffered = null;
    profile.walkingSpots = null;
    profile.address = null;
    profile.idNumber = null;
    profile.age = null;
    profile.phone = null;
    profile.isPublished = false;
    profile.plan = DEFAULT_BUSINESS_PLAN;
    profile.planExpiresAt = null;
    profile.designDraft = null;
    profile.designPublished = null;
    return profile;
  }

  update(params: {
    category?: string;
    businessName?: string | null;
    photos?: string[];
    publicAddress?: string | null;
    hours?: string | null;
    whatsapp?: string | null;
    bio?: string | null;
    serviceArea?: string | null;
    specialty?: string | null;
    photo?: string | null;
    price?: Money | null;
    plansOffered?: string | null;
    walkingSpots?: string | null;
    address?: string | null;
    idNumber?: string | null;
    age?: number | null;
    phone?: string | null;
  }): void {
    if (params.category !== undefined) {
      assertCategoryValid(params.category);
      this.category = params.category;
    }
    if (params.businessName !== undefined) {
      if (params.businessName !== null) {
        assertShortFieldValid('El nombre del negocio', params.businessName);
      }
      this.businessName = params.businessName;
    }
    if (params.photos !== undefined) {
      assertPhotosValid(params.photos);
      this.photosJson = params.photos;
    }
    if (params.publicAddress !== undefined) {
      if (params.publicAddress !== null) {
        assertLongFieldValid('La dirección del negocio', params.publicAddress);
      }
      this.publicAddress = params.publicAddress;
    }
    if (params.hours !== undefined) {
      if (params.hours !== null) assertLongFieldValid('Los horarios', params.hours);
      this.hours = params.hours;
    }
    if (params.whatsapp !== undefined) {
      if (params.whatsapp !== null) assertShortFieldValid('El WhatsApp', params.whatsapp);
      this.whatsapp = params.whatsapp;
    }
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
    if (params.plansOffered !== undefined) {
      if (params.plansOffered !== null) {
        assertLongFieldValid('Los planes y servicios', params.plansOffered);
      }
      this.plansOffered = params.plansOffered;
    }
    if (params.walkingSpots !== undefined) {
      if (params.walkingSpots !== null) {
        assertLongFieldValid('Los parques o sitios', params.walkingSpots);
      }
      this.walkingSpots = params.walkingSpots;
    }
    if (params.address !== undefined) {
      if (params.address !== null) assertLongFieldValid('La dirección', params.address);
      this.address = params.address;
    }
    if (params.idNumber !== undefined) {
      if (params.idNumber !== null) {
        assertShortFieldValid('El número de identidad', params.idNumber);
      }
      this.idNumber = params.idNumber;
    }
    if (params.age !== undefined) {
      if (params.age !== null) assertAgeValid(params.age);
      this.age = params.age;
    }
    if (params.phone !== undefined) {
      if (params.phone !== null) assertShortFieldValid('El teléfono', params.phone);
      this.phone = params.phone;
    }
    this.isPublished = Boolean(
      this.bio &&
        this.businessName &&
        (!requiresRate(this.category) || this.priceAmount !== null),
    );
  }
}
