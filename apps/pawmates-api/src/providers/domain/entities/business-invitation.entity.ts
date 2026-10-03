import { ValidationError } from '@pawmates/common';
import { randomBytes } from 'crypto';
import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';
import { SERVICE_CATEGORIES } from '../value-objects/service-category';
import type { ServiceCategory } from '../value-objects/service-category';
import type { ProviderProfile } from './provider-profile.entity';

const MAX_NAME = 120;
const MAX_ADDRESS = 300;
const MAX_WHATSAPP = 120;
const MAX_HOURS = 300;
const MAX_BIO = 600;
const MAX_NOTE = 200;

/** What the page says when the admin didn't write a description — plain
 * enough to be true of any business in the category. */
const DEFAULT_BIO: Record<ServiceCategory, string> = {
  walker: 'Paseos para tu perro. Escríbenos para conocer horarios y precios.',
  vet: 'Atención veterinaria para tu mascota. Escríbenos para agendar una cita o resolver tus dudas.',
  grooming:
    'Baño y estética para tu mascota. Escríbenos para agendar o conocer precios.',
  boarding:
    'Hospedaje y cuidado para tu mascota. Escríbenos para conocer disponibilidad y precios.',
  training:
    'Entrenamiento para tu perro. Escríbenos para conocer horarios y precios.',
  other: 'Servicios para tu mascota. Escríbenos para más información.',
};

function optional(label: string, value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string')
    throw new ValidationError(`${label} no es válido.`);
  const v = value.trim();
  if (v.length === 0) return null;
  if (v.length > max) {
    throw new ValidationError(
      `${label} debe tener como máximo ${max} caracteres.`,
    );
  }
  return v;
}

/**
 * A business page PET Conect@ prepares for a business that hasn't
 * signed up — the "página lista para reclamar" of the marketing plan.
 *
 * It is never public: it isn't in the directory and has no /s/<slug>.
 * Only whoever holds its link (`token`) can see the preview, and the
 * page goes live only after the business itself claims it — signing up,
 * accepting the terms and passing the usual identity check and approval.
 * That's on purpose: publishing a business without its consent would
 * put words and a phone number online in its name.
 */
@Entity({ name: 'providers_invitations' })
export class BusinessInvitation {
  @PrimaryColumn('text')
  id!: string;

  /** The secret in the link. Random, so links can't be guessed. */
  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ name: 'business_name', type: 'text' })
  businessName!: string;

  @Column({ type: 'text' })
  category!: ServiceCategory;

  @Column({ name: 'public_address', type: 'text', nullable: true })
  publicAddress!: string | null;

  @Column({ type: 'text', nullable: true })
  whatsapp!: string | null;

  @Column({ type: 'text', nullable: true })
  hours!: string | null;

  @Column({ type: 'text' })
  bio!: string;

  /** For the admin only ("visitado el martes", "lo vimos en Maps"). */
  @Column({ type: 'text', nullable: true })
  note!: string | null;

  /** The account that claimed it — cleared if that account is deleted,
   * while `claimedAt` stays so the invitation still reads as used. */
  @Column({ name: 'claimed_by', type: 'text', nullable: true })
  claimedBy!: string | null;

  @Column({ name: 'claimed_at', type: 'datetime', nullable: true })
  claimedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;

  get isClaimed(): boolean {
    return this.claimedAt !== null;
  }

  static create(params: {
    businessName?: unknown;
    category?: unknown;
    publicAddress?: unknown;
    whatsapp?: unknown;
    hours?: unknown;
    bio?: unknown;
    note?: unknown;
  }): BusinessInvitation {
    const businessName = optional(
      'El nombre del negocio',
      params.businessName,
      MAX_NAME,
    );
    if (!businessName)
      throw new ValidationError('Falta el nombre del negocio.');
    if (!SERVICE_CATEGORIES.includes(params.category as ServiceCategory)) {
      throw new ValidationError(`La categoría de «${businessName}» no existe.`);
    }
    const category = params.category as ServiceCategory;
    const inv = new BusinessInvitation();
    inv.id = ulid().toLowerCase();
    inv.token = randomBytes(12).toString('base64url');
    inv.businessName = businessName;
    inv.category = category;
    inv.publicAddress = optional(
      'La dirección',
      params.publicAddress,
      MAX_ADDRESS,
    );
    inv.whatsapp = optional('El WhatsApp', params.whatsapp, MAX_WHATSAPP);
    inv.hours = optional('El horario', params.hours, MAX_HOURS);
    inv.bio =
      optional('La descripción', params.bio, MAX_BIO) ?? DEFAULT_BIO[category];
    inv.note = optional('La nota', params.note, MAX_NOTE);
    inv.claimedBy = null;
    inv.claimedAt = null;
    return inv;
  }

  /**
   * Hands the prepared page to the business that claimed it. Only fills
   * what its own page doesn't have yet — whatever the business already
   * wrote is theirs and wins.
   */
  claim(profile: ProviderProfile, now: Date = new Date()): void {
    if (this.isClaimed && this.claimedBy !== profile.accountId) {
      throw new ValidationError('Esta página ya la reclamó otro negocio.');
    }
    profile.update({
      businessName: profile.businessName ?? this.businessName,
      bio: profile.bio ?? this.bio,
      publicAddress: profile.publicAddress ?? this.publicAddress,
      whatsapp: profile.whatsapp ?? this.whatsapp,
      hours: profile.hours ?? this.hours,
    });
    if (!this.isClaimed) {
      this.claimedBy = profile.accountId;
      this.claimedAt = now;
    }
  }
}
