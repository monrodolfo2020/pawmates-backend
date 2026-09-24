import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type FaceMatchStatus = 'compared' | 'no_face_selfie' | 'no_face_id' | 'error';

/**
 * Captured at signup as (or later becoming) a provider — face photo + ID
 * document photo, kept in private blob storage (or inline in this row
 * when no private store is configured; see private-blob-storage.ts) and
 * destroyed once an admin decides. `status` starts
 * `pending`; an admin reviews the two photos and moves it to `verified`
 * or `rejected` via PATCH /v1/admin/provider-verifications/:id
 * (AdminVerificationsController) — there's still no automated check, that decision
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

  /**
   * The automatic comparison of the two photos (see compareFaces in
   * @pawmates/common): an aid for the admin reviewing this, never the
   * decision. null when it never ran — switched off, or photos sent
   * before it existed. Survives the photos being deleted, like the
   * status: it's part of the record of how the decision was made.
   */
  @Column({ name: 'face_match_status', type: 'text', nullable: true })
  faceMatchStatus!: FaceMatchStatus | null;

  /** 0–100, only when faceMatchStatus is 'compared'. */
  @Column({ name: 'face_match_similarity', type: 'real', nullable: true })
  faceMatchSimilarity!: number | null;

  @Column({ name: 'face_match_checked_at', type: 'datetime', nullable: true })
  faceMatchCheckedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt!: Date;
}
