import {
  CompareFacesCommand,
  InvalidParameterException,
  RekognitionClient,
} from '@aws-sdk/client-rekognition';
import { deflateSync } from 'zlib';

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
  | {
      status: 'no_face_selfie' | 'no_face_id' | 'error';
      similarity: null;
      detail?: string;
    };

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
  client ??= new RekognitionClient({
    region: process.env.AWS_REGION?.trim() || 'us-east-1',
  });
  return client;
}

/** Compares the face in `selfie` with the face(s) in `idDocument`. Never
 * throws: every failure comes back as a result, so a signup is never
 * held up by it. */
export async function compareFaces(
  selfie: Buffer,
  idDocument: Buffer,
): Promise<FaceMatchResult> {
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
    return {
      status: 'compared',
      similarity: Math.round(Math.max(0, ...scores) * 10) / 10,
    };
  } catch (error) {
    // Rekognition's way of saying the *source* image has no face.
    if (error instanceof InvalidParameterException) {
      return { status: 'no_face_selfie', similarity: null };
    }
    console.error('[face-match] la comparación no se pudo hacer', error);
    return {
      status: 'error',
      similarity: null,
      detail: error instanceof Error ? error.name : undefined,
    };
  }
}

export type FaceMatchConnection =
  'ok' | 'missing_keys' | 'bad_keys' | 'no_permission' | 'unreachable';

/**
 * Checks the AWS keys, the permission and the region without anyone's
 * photo: it sends a generated single-colour image, which has no face.
 * With everything right, Rekognition answers "no face in the image"
 * (InvalidParameterException) — that answer *is* the success. Any other
 * error says what's wrong. Works whether or not FACE_MATCH_ENABLED is on,
 * so the keys can be checked before the feature goes live.
 */
export async function testFaceMatchConnection(): Promise<{
  connection: FaceMatchConnection;
  region: string;
  detail?: string;
}> {
  const region = process.env.AWS_REGION?.trim() || 'us-east-1';
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { connection: 'missing_keys', region };
  }
  const blank = solidPng(96, 96);
  try {
    await rekognition().send(
      new CompareFacesCommand({
        SourceImage: { Bytes: blank },
        TargetImage: { Bytes: blank },
      }),
      { abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    return { connection: 'ok', region };
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    if (
      error instanceof InvalidParameterException ||
      name === 'InvalidParameterException'
    ) {
      return { connection: 'ok', region };
    }
    if (
      /UnrecognizedClient|InvalidSignature|InvalidClientTokenId|SignatureDoesNotMatch/.test(
        name,
      )
    ) {
      return { connection: 'bad_keys', region, detail: name };
    }
    if (/AccessDenied/.test(name)) {
      return { connection: 'no_permission', region, detail: name };
    }
    return { connection: 'unreachable', region, detail: name };
  }
}

/** A tiny PNG of one flat colour, built here so the test never touches a
 * real photo. */
function solidPng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0xc8)]);
  const pixels = deflateSync(
    Buffer.concat(Array.from({ length: height }, () => row)),
  );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
