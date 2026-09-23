import {
  AdminGuard,
  JwtAuthGuard,
  ResourceNotFoundError,
  classifyStoredPhoto,
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
import { ProviderVerification } from '../../domain/entities/provider-verification.entity';
import { ProviderProfile } from '../../../providers/domain/entities/provider-profile.entity';
import { UpdateProviderVerificationDto } from '../dto/update-provider-verification.dto';

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
  ) {}

  @Get()
  async list() {
    const rows = await this.verifications.find({
      order: { createdAt: 'DESC' },
    });
    const accountIds = rows.map((v) => v.accountId);
    const publishedIds = accountIds.length
      ? new Set(
          (
            await this.providerProfiles.find({
              where: { accountId: In(accountIds), isPublished: true },
            })
          ).map((p) => p.accountId),
        )
      : new Set<string>();
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
        profilePublished: publishedIds.has(v.accountId),
        photosDeletedAt: v.photosDeletedAt,
        createdAt: v.createdAt,
      })),
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
