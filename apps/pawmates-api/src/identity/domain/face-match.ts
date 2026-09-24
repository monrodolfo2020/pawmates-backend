import { compareFaces, faceMatchEnabled, readStoredPhoto } from '@pawmates/common';
import type { FaceMatchResult } from '@pawmates/common';
import type { ProviderVerification } from './entities/provider-verification.entity';

/**
 * Runs the automatic face comparison on a verification's two photos and
 * writes the outcome onto it (the caller saves). Does nothing when the
 * feature is switched off, and never throws — a signup or a resubmission
 * must go through whatever happens here.
 */
export async function applyFaceMatch(
  verification: ProviderVerification,
  compare: (a: Buffer, b: Buffer) => Promise<FaceMatchResult> = compareFaces,
): Promise<void> {
  if (!faceMatchEnabled()) return;
  try {
    const [selfie, idDocument] = await Promise.all([
      readStoredPhoto(verification.facePhotoBase64),
      readStoredPhoto(verification.idDocumentPhotoBase64),
    ]);
    const result: FaceMatchResult =
      selfie && idDocument ? await compare(selfie, idDocument) : { status: 'error', similarity: null };
    verification.faceMatchStatus = result.status;
    verification.faceMatchSimilarity = result.similarity;
  } catch {
    verification.faceMatchStatus = 'error';
    verification.faceMatchSimilarity = null;
  }
  verification.faceMatchCheckedAt = new Date();
}
