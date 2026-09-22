import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { ulid } from 'ulid';
import type { LegalDocumentType } from '../value-objects/legal-document';

/**
 * Evidence that one account accepted one version of one document, at one
 * moment. A contract nobody can show was accepted is very hard to
 * enforce, and consent that can't be evidenced is, for data-protection
 * purposes, consent that wasn't obtained.
 *
 * Rows are **append-only**: accepting a new version writes another row
 * rather than updating the old one, so the history of what someone
 * agreed to, and when, stays intact. The unique index is on
 * (account, document, version) — re-accepting the same version is
 * idempotent, while a new version always gets its own row.
 *
 * `ipAddress` and `userAgent` are kept because they are what makes the
 * record worth anything in a dispute. They are personal data themselves,
 * which is why the privacy notice lists them.
 */
@Entity('identity_legal_acceptances')
@Index(['accountId', 'documentType', 'documentVersion'], { unique: true })
export class LegalAcceptance {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'account_id', type: 'text' })
  accountId!: string;

  @Column({ name: 'document_type', type: 'text' })
  documentType!: LegalDocumentType;

  @Column({ name: 'document_version', type: 'text' })
  documentVersion!: string;

  @Column({ name: 'ip_address', type: 'text', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'accepted_at', type: 'datetime' })
  acceptedAt!: Date;

  static record(params: {
    accountId: string;
    documentType: LegalDocumentType;
    documentVersion: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): LegalAcceptance {
    const acceptance = new LegalAcceptance();
    acceptance.id = ulid().toLowerCase();
    acceptance.accountId = params.accountId;
    acceptance.documentType = params.documentType;
    acceptance.documentVersion = params.documentVersion;
    acceptance.ipAddress = params.ipAddress ?? null;
    // Truncated: a user agent is unbounded input, and only its gist is
    // ever useful as evidence.
    acceptance.userAgent = params.userAgent?.slice(0, 300) ?? null;
    return acceptance;
  }
}
