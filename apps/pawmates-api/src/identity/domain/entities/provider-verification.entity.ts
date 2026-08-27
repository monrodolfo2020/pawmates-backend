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
 * `pending` and stays that way: no automated check runs against these
 * yet — that's the AI verification step this is explicitly laying the
 * groundwork for, not built in this pass.
 */
@Entity({ name: 'provider_verifications', schema: 'identity' })
export class ProviderVerification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'account_id', type: 'uuid', unique: true })
  accountId!: string;

  @Column({ name: 'face_photo_base64', type: 'text' })
  facePhotoBase64!: string;

  @Column({ name: 'id_document_photo_base64', type: 'text' })
  idDocumentPhotoBase64!: string;

  @Column({ type: 'text', default: 'pending' })
  status!: VerificationStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
