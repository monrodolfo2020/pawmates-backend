import {
  CurrentAccount,
  JwtAuthGuard,
  ValidationError,
} from '@pawmates/common';
import type { AuthenticatedAccount } from '@pawmates/common';
import { Body, Controller, Get, Ip, Post, Headers, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalAcceptance } from '../domain/entities/legal-acceptance.entity';
import {
  LEGAL_DOCUMENTS,
  LEGAL_DOCUMENT_TITLES,
  LEGAL_DOCUMENT_VERSIONS,
  assertLegalDocumentType,
  documentsRequiredFor,
  isCurrentVersion,
} from '../domain/value-objects/legal-document';
import type { LegalDocumentType } from '../domain/value-objects/legal-document';
import { AcceptLegalDto } from './dto/accept-legal.dto';

/**
 * The legal documents and the record of who accepted them.
 *
 * The list of versions is public because the app has to know which text
 * to show before anyone has an account. Recording an acceptance needs a
 * token, except at signup, where AuthService writes the record as part
 * of creating the account (there is no token yet at that point).
 */
@Controller('v1/legal')
export class LegalController {
  constructor(
    @InjectRepository(LegalAcceptance)
    private readonly acceptances: Repository<LegalAcceptance>,
  ) {}

  /** Which documents exist, at which version, and who has to accept
   * each one. The app renders the matching bundled text. */
  @Get('documents')
  documents() {
    return {
      data: LEGAL_DOCUMENTS.map((type) => ({
        type,
        title: LEGAL_DOCUMENT_TITLES[type],
        version: LEGAL_DOCUMENT_VERSIONS[type],
        requiredForOwner: documentsRequiredFor('owner').includes(type),
        requiredForProvider: documentsRequiredFor('provider').includes(type),
      })),
    };
  }

  /**
   * What this account has accepted, and what it still owes. Accounts
   * created before any of this existed have no records at all, so
   * everything required for their role comes back as pending — which is
   * the honest answer, and lets the app ask them rather than pretending
   * they consented.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async mine(@CurrentAccount() account: AuthenticatedAccount) {
    const rows = await this.acceptances.find({
      where: { accountId: account.accountId },
      order: { acceptedAt: 'DESC' },
    });
    const role = account.roles.includes('provider') ? 'provider' : 'owner';
    const accepted = new Set(
      rows
        .filter((r) => isCurrentVersion(r.documentType, r.documentVersion))
        .map((r) => r.documentType),
    );
    return {
      data: {
        accepted: rows.map((r) => ({
          type: r.documentType,
          version: r.documentVersion,
          acceptedAt: r.acceptedAt,
          isCurrent: isCurrentVersion(r.documentType, r.documentVersion),
        })),
        pending: documentsRequiredFor(role).filter((t) => !accepted.has(t)),
      },
    };
  }

  /**
   * Records an acceptance after signup: a new version of a document, or
   * the separate consent for identity verification.
   *
   * The version the client sends has to be the one currently in force —
   * otherwise an outdated app build could produce a record saying
   * someone accepted a text that was never on their screen, which is
   * exactly the kind of evidence that falls apart when it matters.
   */
  @Post('accept')
  @UseGuards(JwtAuthGuard)
  async accept(
    @Body() dto: AcceptLegalDto,
    @CurrentAccount() account: AuthenticatedAccount,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    assertLegalDocumentType(dto.type);
    if (!isCurrentVersion(dto.type, dto.version)) {
      throw new ValidationError(
        'Ese documento cambió. Vuelve a cargar la aplicación para revisar la versión vigente.',
      );
    }
    await recordAcceptances(this.acceptances, {
      accountId: account.accountId,
      documents: [{ type: dto.type, version: dto.version }],
      ipAddress: ip,
      userAgent,
    });
    return { data: { type: dto.type, version: dto.version } };
  }
}

/**
 * Writes acceptance rows, ignoring ones already on file. Shared with
 * AuthService, which records the signup acceptance before the account
 * has a token of its own.
 *
 * Re-accepting the same version is a no-op rather than an error: a
 * retried signup request, or a person tapping twice, should not fail on
 * a unique-index violation.
 */
export async function recordAcceptances(
  repository: Repository<LegalAcceptance>,
  params: {
    accountId: string;
    documents: { type: LegalDocumentType; version: string }[];
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  for (const document of params.documents) {
    const existing = await repository.findOne({
      where: {
        accountId: params.accountId,
        documentType: document.type,
        documentVersion: document.version,
      },
    });
    if (existing) continue;
    await repository.save(
      LegalAcceptance.record({
        accountId: params.accountId,
        documentType: document.type,
        documentVersion: document.version,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      }),
    );
  }
}
