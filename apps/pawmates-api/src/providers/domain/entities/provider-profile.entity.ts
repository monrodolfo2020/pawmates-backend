import { Money, ValidationError } from '@pawmates/common';
import {
  Column,
  CreateDateColumn,
  Entity,
  IsNull,
  Not,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { FindOptionsWhere } from 'typeorm';
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

  /** Where the business is, once it has picked itself off a map search
   * (see GeoController). Optional: a paseador works across a zone rather
   * than at an address, and a business can publish without it. Its only
   * job today is making the page's "Cómo llegar" exact instead of a text
   * search, so a wrong pin is worse than no pin. */
  @Column({ type: 'real', nullable: true })
  latitude!: number | null;

  @Column({ type: 'real', nullable: true })
  longitude!: number | null;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished!: boolean;

  /**
   * When an admin approved this business to appear publicly; null while
   * it waits. Separate from `isPublished`, which only says the page has
   * enough content, and from the account being suspended, which locks the
   * person out entirely — a business waiting for approval can still sign
   * in and prepare its page, nobody else can see it yet.
   */
  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', default: DEFAULT_BUSINESS_PLAN })
  plan!: BusinessPlan;

  /** When a paid VIP runs out. null means "doesn't run out": the free
   * plan, and also a VIP an admin granted by hand, which is a courtesy
   * with no billing period behind it (see setPlan). */
  @Column({ name: 'plan_expires_at', type: 'datetime', nullable: true })
  planExpiresAt!: Date | null;

  /**
   * When the free trial of the page editor runs out: TRIAL_DAYS after
   * the business was first approved (see startTrial). null until then —
   * a business still waiting for review can already design its page,
   * and those days don't count against it.
   */
  @Column({ name: 'trial_ends_at', type: 'datetime', nullable: true })
  trialEndsAt!: Date | null;

  /** The last trial email sent (see trialNoticeDue), so each goes out
   * once even though the daily job looks at the business every day. */
  @Column({ name: 'trial_notice_stage', type: 'text', nullable: true })
  trialNoticeStage!: TrialNotice | null;

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
  /** The last published design, brought up to date like draftDesign. */
  get publishedDesign(): PageDesign | null {
    return normalizeDesign(this.designPublished);
  }

    get draftDesign(): PageDesign {
    return normalizeDesign(this.designDraft ?? this.designPublished) ?? DEFAULT_PAGE_DESIGN;
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

  /** Days a newly approved business gets to use the editor for free. */
  static readonly TRIAL_DAYS = 30;

  /** Starts the free trial the first time a business is approved.
   * Approving again (after taking the approval back) doesn't restart it. */
  startTrial(now: Date = new Date()): void {
    if (this.trialEndsAt !== null) return;
    this.trialEndsAt = new Date(now.getTime() + ProviderProfile.TRIAL_DAYS * 24 * 60 * 60 * 1000);
  }

  /**
   * Which trial email this business should get now, if any: a week
   * before the end, the day before, and once it's over. A business that
   * went VIP gets none. If the daily job missed a day, it sends only the
   * latest one that applies — never "7 days left" to someone whose trial
   * ended yesterday.
   */
  trialNoticeDue(now: Date = new Date()): TrialNotice | null {
    if (this.trialEndsAt === null || this.isVip(now)) return null;
    const left = this.trialEndsAt.getTime() - now.getTime();
    const due: TrialNotice | null =
      left <= 0 ? 'ended' : left <= DAY_MS ? '1d' : left <= 7 * DAY_MS ? '7d' : null;
    if (due === null) return null;
    const sent = this.trialNoticeStage ? TRIAL_NOTICES.indexOf(this.trialNoticeStage) : -1;
    return TRIAL_NOTICES.indexOf(due) > sent ? due : null;
  }

  inTrial(now: Date = new Date()): boolean {
    return this.trialEndsAt !== null && this.trialEndsAt.getTime() > now.getTime();
  }

  /**
   * Whether the business may design its page — and whether visitors see
   * that design. True on VIP, during the trial, and while the business
   * waits for its first approval (nobody sees the page yet, and the
   * trial hasn't started). Once the trial is over without VIP, the page
   * goes back to PawMates' standard design; the business's own design
   * stays saved for when it pays.
   */
  canCustomize(now: Date = new Date()): boolean {
    if (this.isVip(now) || this.inTrial(now)) return true;
    return this.approvedAt === null && this.trialEndsAt === null;
  }

  get effectiveDesign(): PageDesign {
    if (!this.canCustomize()) return DEFAULT_PAGE_DESIGN;
    return normalizeDesign(this.designPublished) ?? DEFAULT_PAGE_DESIGN;
  }

  /** Whether visitors can see this business: complete *and* approved
   * (`isPublished` only means complete). The same rule as a query is
   * PUBLICLY_VISIBLE, below — change both together. A suspended
   * account is hidden on top of this, by whoever lists businesses. */
  get isPubliclyVisible(): boolean {
    return this.isPublished && this.approvedAt !== null;
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
    this.assertCanCustomize();
    this.designDraft = parsePageDesign(design);
  }

  publishDesign(): void {
    this.assertCanCustomize();
    this.designPublished = this.designDraft ?? DEFAULT_PAGE_DESIGN;
  }

  private assertCanCustomize(): void {
    if (!this.canCustomize()) {
      throw new ValidationError(
        'Tu prueba gratis terminó. Activa el plan VIP para seguir personalizando tu página.',
      );
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
    profile.latitude = null;
    profile.longitude = null;
    profile.approvedAt = null;
    profile.walkingSpots = null;
    profile.address = null;
    profile.idNumber = null;
    profile.age = null;
    profile.phone = null;
    profile.isPublished = false;
    profile.plan = DEFAULT_BUSINESS_PLAN;
    profile.planExpiresAt = null;
    profile.trialEndsAt = null;
    profile.trialNoticeStage = null;
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
    latitude?: number | null;
    longitude?: number | null;
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
    // Latitude and longitude move together: half a coordinate is a point
    // nowhere, so passing one without the other is refused rather than
    // silently stored.
    if (params.latitude !== undefined || params.longitude !== undefined) {
      const lat = params.latitude ?? null;
      const lon = params.longitude ?? null;
      if ((lat === null) !== (lon === null)) {
        throw new ValidationError(
          'La ubicación necesita latitud y longitud, o ninguna de las dos.',
        );
      }
      if (lat !== null && lon !== null) {
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          throw new ValidationError('Esa latitud no es válida.');
        }
        if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
          throw new ValidationError('Esa longitud no es válida.');
        }
      }
      this.latitude = lat;
      this.longitude = lon;
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

/** isPubliclyVisible as a `where` clause, for the queries behind the
 * directory, a business's public page and booking. */
export const PUBLICLY_VISIBLE: FindOptionsWhere<ProviderProfile> = {
  isPublished: true,
  approvedAt: Not(IsNull()),
};

/**
 * Designs are stored as the business saved them, so an older one may
 * predate blocks. Reading it through the parser brings it up to date;
 * one that somehow no longer parses is served as stored rather than
 * breaking the page.
 */
function normalizeDesign(design: PageDesign | null): PageDesign | null {
  if (!design) return null;
  try {
    return parsePageDesign(design);
  } catch {
    return design;
  }
}

/** The trial emails, in the order they go out. */
export const TRIAL_NOTICES = ['7d', '1d', 'ended'] as const;
export type TrialNotice = (typeof TRIAL_NOTICES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
