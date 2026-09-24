import {
  AdminGuard,
  JwtAuthGuard,
  ResourceNotFoundError,
  ValidationError,
  classifyStoredPhoto,
  faceMatchEnabled,
  deleteStoredPhoto,
  moveToPrivateStorage,
  signedPhotoUrl,
} from '@pawmates/common';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account } from '../../domain/entities/account.entity';
import { ProviderVerification } from '../../domain/entities/provider-verification.entity';
import { ProviderProfile } from '../../../providers/domain/entities/provider-profile.entity';
import { UpdateProviderVerificationDto } from '../dto/update-provider-verification.dto';
import { applyFaceMatch } from '../../domain/face-match';

/** Admin panel, "Verificaciones" tab: reviewing the identity photos
 * businesses send, and destroying them once reviewed. */
@Controller('v1/admin/provider-verifications')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminVerificationsController {
  constructor(
    @InjectRepository(ProviderVerification)
    private readonly verifications: Repository<ProviderVerification>,
    @InjectRepository(ProviderProfile)
    private readonly providerProfiles: Repository<ProviderProfile>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  @Get()
  async list() {
    const rows = await this.verifications.find({
      order: { createdAt: 'DESC' },
    });
    const accountIds = [...new Set(rows.map((v) => v.accountId))];
    // Who each row is, so the panel can say "Paseos Pedro" instead of an
    // account id. One query per table, not one per row.
    const [profiles, accounts] = accountIds.length
      ? await Promise.all([
          this.providerProfiles.find({ where: { accountId: In(accountIds) } }),
          this.accounts.find({ where: { id: In(accountIds) } }),
        ])
      : [[], []];
    const profileById = new Map(profiles.map((p) => [p.accountId, p]));
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    // These two are private blobs, so the row holds a pathname rather
    // than a usable URL — each response gets its own short-lived signed
    // link (see private-blob-storage.ts). A photo that can't be signed
    // comes back null and renders as a placeholder, so one broken object
    // doesn't take down the whole list.
    const signed = await Promise.all(
      rows.map(async (v) => ({
        id: v.id,
        facePhoto: v.facePhotoBase64
          ? await signedPhotoUrl(v.facePhotoBase64)
          : null,
        idDocumentPhoto: v.idDocumentPhotoBase64
          ? await signedPhotoUrl(v.idDocumentPhotoBase64)
          : null,
      })),
    );
    const signedById = new Map(signed.map((s) => [s.id, s]));

    return {
      data: rows.map((v) => ({
        id: v.id,
        accountId: v.accountId,
        status: v.status,
        facePhoto: signedById.get(v.id)?.facePhoto ?? null,
        idDocumentPhoto: signedById.get(v.id)?.idDocumentPhoto ?? null,
        // Verifying identity (this row) and completing the page
        // (ProviderProfile) are independent — this flags a verified
        // business that still hasn't finished its page.
        businessName: profileById.get(v.accountId)?.businessName ?? null,
        accountName: accountById.get(v.accountId)?.name ?? null,
        email: accountById.get(v.accountId)?.email ?? null,
        profilePublished: profileById.get(v.accountId)?.isPublished ?? false,
        photosDeletedAt: v.photosDeletedAt,
        // Whether "Comparar rostros" can run for this row right now.
        faceMatchAvailable:
          faceMatchEnabled() && v.facePhotoBase64 !== null && v.idDocumentPhotoBase64 !== null,
        faceMatch: v.faceMatchStatus
          ? { status: v.faceMatchStatus, similarity: v.faceMatchSimilarity, checkedAt: v.faceMatchCheckedAt }
          : null,
        createdAt: v.createdAt,
      })),
    };
  }

  /** Runs (or reruns) the face comparison for one verification whose
   * photos are still on file — for ones sent before the comparison was
   * switched on, or when it failed the first time. */
  @Post(':id/face-match')
  async faceMatch(@Param('id') id: string) {
    if (!faceMatchEnabled()) {
      throw new ValidationError('La comparación de rostros no está activada.');
    }
    const verification = await this.verifications.findOne({ where: { id } });
    if (!verification) {
      throw new ResourceNotFoundError(`Verificación ${id} no existe.`);
    }
    if (!verification.facePhotoBase64 || !verification.idDocumentPhotoBase64) {
      throw new ValidationError('Las fotos de esta verificación ya se borraron.');
    }
    await applyFaceMatch(verification);
    await this.verifications.save(verification);
    return {
      data: {
        status: verification.faceMatchStatus,
        similarity: verification.faceMatchSimilarity,
        checkedAt: verification.faceMatchCheckedAt,
      },
    };
  }

  /** Approve or reject a provider's pending identity verification — the
   * one action that turns "no automated check runs against these yet"
   * (see ProviderVerification's comment) into a real decision. It only
   * drives the public "Identidad verificada" badge (see
   * ProvidersController), not whether the business can be booked. */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProviderVerificationDto,
  ) {
    const verification = await this.verifications.findOne({ where: { id } });
    if (!verification) {
      throw new ResourceNotFoundError(`Verificación ${id} no existe.`);
    }
    verification.status = dto.status;
    // The images existed for this decision and nothing else, so the
    // decision is where they stop. What survives is the outcome and its
    // date — see ProviderVerification's comment.
    await deletePhotosOf(verification);
    await this.verifications.save(verification);
    return {
      data: {
        id: verification.id,
        accountId: verification.accountId,
        status: verification.status,
        photosDeletedAt: verification.photosDeletedAt,
        createdAt: verification.createdAt,
      },
    };
  }

  /**
   * One-off cleanup for the identity photos uploaded before private
   * storage existed: those sit on the public blob store, where anyone
   * holding the URL can open a provider's face and ID document. This
   * moves each one into private storage and deletes the public original.
   *
   * Idempotent — rows already private, or still holding inline base64,
   * are counted as skipped and left alone. Each row is handled on its
   * own, so one unreachable object doesn't abort the rest; the response
   * says exactly what happened.
   */
  @Post('secure-legacy-photos')
  async secureLegacyPhotos() {
    const rows = await this.verifications.find();
    let moved = 0;
    let skipped = 0;
    const failed: string[] = [];

    for (const row of rows) {
      const needsWork =
        (row.facePhotoBase64 !== null &&
          classifyStoredPhoto(row.facePhotoBase64) === 'public') ||
        (row.idDocumentPhotoBase64 !== null &&
          classifyStoredPhoto(row.idDocumentPhotoBase64) === 'public');
      if (!needsWork) {
        skipped += 1;
        continue;
      }
      try {
        if (row.facePhotoBase64) {
          row.facePhotoBase64 = await moveToPrivateStorage(
            row.facePhotoBase64,
            'verifications',
          );
        }
        if (row.idDocumentPhotoBase64) {
          row.idDocumentPhotoBase64 = await moveToPrivateStorage(
            row.idDocumentPhotoBase64,
            'verifications',
          );
        }
        await this.verifications.save(row);
        moved += 1;
      } catch {
        failed.push(row.id);
      }
    }

    return { data: { total: rows.length, moved, skipped, failed } };
  }
}

/**
 * Destroys both identity images and records when. Best effort on the
 * storage side: if the object can't be deleted the column is cleared
 * anyway, because a row still pointing at an image we meant to destroy
 * is the worse of the two failures.
 */
async function deletePhotosOf(
  verification: ProviderVerification,
): Promise<void> {
  await Promise.all([
    deleteStoredPhoto(verification.facePhotoBase64),
    deleteStoredPhoto(verification.idDocumentPhotoBase64),
  ]);
  verification.facePhotoBase64 = null;
  verification.idDocumentPhotoBase64 = null;
  verification.photosDeletedAt = new Date();
}
