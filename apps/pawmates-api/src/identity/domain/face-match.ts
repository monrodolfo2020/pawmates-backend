import {
  compareFaces,
  faceMatchEnabled,
  photoFeedbackEmailContent,
  readStoredPhoto,
  sendPhotoFeedbackEmail,
} from '@pawmates/common';
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
      selfie && idDocument
        ? await compare(selfie, idDocument)
        : { status: 'error', similarity: null };
    verification.faceMatchStatus = result.status;
    verification.faceMatchSimilarity = result.similarity;
  } catch {
    verification.faceMatchStatus = 'error';
    verification.faceMatchSimilarity = null;
  }
  verification.faceMatchCheckedAt = new Date();
}

/** Below this similarity the faces are treated as "don't look alike" —
 * the same line the admin panel draws in red. */
export const FACE_MISMATCH_BELOW = 70;

/**
 * What the business should be told about its own photos, if anything:
 * which one to retake, or that the two faces don't look alike. Only
 * while the verification is pending (after a decision the photos are
 * gone), and never the percentage itself — that would only help someone
 * tune a fake until it passes.
 */
export function photoFeedback(
  v: Pick<
    ProviderVerification,
    'status' | 'faceMatchStatus' | 'faceMatchSimilarity'
  > | null,
): 'retake_selfie' | 'retake_id' | 'mismatch' | null {
  if (!v || v.status !== 'pending') return null;
  if (v.faceMatchStatus === 'no_face_selfie') return 'retake_selfie';
  if (v.faceMatchStatus === 'no_face_id') return 'retake_id';
  if (
    v.faceMatchStatus === 'compared' &&
    (v.faceMatchSimilarity ?? 100) < FACE_MISMATCH_BELOW
  ) {
    return 'mismatch';
  }
  return null;
}

const APP_URL = process.env.APP_URL ?? 'https://pawmates-one.vercel.app';

/**
 * Emails the business when its just-sent photos need another look (see
 * photoFeedback). Called where photos are submitted — signup and the
 * panel — not when an admin reruns the comparison, so nobody gets the
 * same email twice for one submission. Never throws; a failed email is
 * logged by sendEmail and the panel still shows the same advice.
 */
export async function emailPhotoFeedback(
  verification: ProviderVerification,
  to: { email: string; businessName: string },
  send = sendPhotoFeedbackEmail,
): Promise<boolean> {
  const feedback = photoFeedback(verification);
  if (!feedback) return false;
  const result = await send(
    to.email,
    photoFeedbackEmailContent({
      feedback,
      businessName: to.businessName,
      appUrl: APP_URL,
    }),
  ).catch(() => ({ sent: false }));
  return result.sent;
}
