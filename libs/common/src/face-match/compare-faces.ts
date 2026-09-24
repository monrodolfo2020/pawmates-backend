import {
  CompareFacesCommand,
  InvalidParameterException,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';

/**
 * What comparing a business's face photo with its ID photo found.
 *
 * - `compared`: a face in each; `similarity` is 0–100 for the closest pair.
 * - `no_face_selfie` / `no_face_id`: one of the two photos has no face
 *   the service could find (blurry, glare, cropped, not a face at all).
 * - `error`: the comparison couldn't run — service down, an image it
 *   can't read. Says nothing about the person.
 *
 * It's an aid for whoever reviews the verification, never a decision:
 * a poor ID photo scores low for the right person, and a printed photo
 * of someone else can score high (no liveness check here).
 */
export type FaceMatchResult =
  | { status: 'compared'; similarity: number }
  | { status: 'no_face_selfie' | 'no_face_id' | 'error'; similarity: null; detail?: string };

const TIMEOUT_MS = 8000;

/**
 * Off unless FACE_MATCH_ENABLED=true *and* AWS credentials are set.
 * The switch is separate from the keys on purpose: comparing faces is
 * biometric processing, and it should only start once the privacy notice
 * and the verification consent say so — flipping it on is that decision.
 */
export function faceMatchEnabled(): boolean {
  return (
    process.env.FACE_MATCH_ENABLED === 'true' &&
    Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
  );
}

let client: RekognitionClient | null = null;
function rekognition(): RekognitionClient {
  // Reads AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY from the environment.
  client ??= new RekognitionClient({ region: process.env.AWS_REGION?.trim() || 'us-east-1' });
  return client;
}

/** Compares the face in `selfie` with the face(s) in `idDocument`. Never
 * throws: every failure comes back as a result, so a signup is never
 * held up by it. */
export async function compareFaces(selfie: Buffer, idDocument: Buffer): Promise<FaceMatchResult> {
  try {
    const out = await rekognition().send(
      new CompareFacesCommand({
        SourceImage: { Bytes: selfie },
        TargetImage: { Bytes: idDocument },
        // 0 so every face on the ID comes back with its score, instead of
        // only those above the service's default of 80.
        SimilarityThreshold: 0,
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const scores = (out.FaceMatches ?? []).map((m) => m.Similarity ?? 0);
    if (scores.length === 0 && (out.UnmatchedFaces ?? []).length === 0) {
      return { status: 'no_face_id', similarity: null };
    }
    return { status: 'compared', similarity: Math.round(Math.max(0, ...scores) * 10) / 10 };
  } catch (error) {
    // Rekognition's way of saying the *source* image has no face.
    if (error instanceof InvalidParameterException) {
      return { status: 'no_face_selfie', similarity: null };
    }
    console.error('[face-match] la comparación no se pudo hacer', error);
    return { status: 'error', similarity: null, detail: error instanceof Error ? error.name : undefined };
  }
}
