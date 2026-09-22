import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

/**
 * Captured once, at signup as (or later becoming) a provider — face photo
 * + ID document photo, both base64 in Postgres for this MVP (see
 * README/DEPLOY.md for the tradeoff that accepts). `status` starts
 * `pending`; an admin reviews the two photos and moves it to `verified`
 * or `rejected` via PATCH /v1/admin/provider-verifications/:id
 * (AdminController) — there's still no automated check, that decision
 * is a human looking at the photos, which is what this was always laying
 * the groundwork for.
 */
@Entity({ name: 'identity_provider_verifications' })
export class ProviderVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_id', type: 'text', unique: true })
  accountId!: string;

  /** Nullable because the images are **deleted once the verification is
   * resolved**: what has to survive is the decision and its date, not a
   * face and an official ID sitting in storage indefinitely. Holding
   * them longer is hard to justify against the proportionality
   * principle, and is exactly the material a leak would be worst. */
  @Column({ name: 'face_photo_base64', type: 'text', nullable: true })
  facePhotoBase64!: string | null;

  @Column({ name: 'id_document_photo_base64', type: 'text', nullable: true })
  idDocumentPhotoBase64!: string | null;

  /** When the two images were destroyed, which is the record that
   * replaces them. */
  @Column({ name: 'photos_deleted_at', type: 'datetime', nullable: true })
  photosDeletedAt!: Date | null;

  @Column({ type: 'text', default: 'pending' })
  status!: VerificationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
