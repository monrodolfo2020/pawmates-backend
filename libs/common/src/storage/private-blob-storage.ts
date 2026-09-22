import { copy, del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { ulid } from 'ulid';
import { ValidationError } from '../errors/domain-error';

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/** How long a signed link to a private image stays usable. Short on
 * purpose: it exists so one admin can look at one photo in one sitting,
 * and a link that leaks should stop working before it can be passed on. */
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

/**
 * Storage for images that must NOT be reachable by anyone holding a URL:
 * today, the two identity-verification photos (a provider's face and
 * their ID document). Those concentrate name, photo, signature and —
 * depending on the document — address, CURP and voter key in one image,
 * so "the filename is unguessable" is not an access control.
 *
 * The difference from blob-storage.ts is deliberate and is the whole
 * point of this module: that one uploads with `access: 'public'` and
 * stores a URL that works forever for anybody; this one uploads with
 * `access: 'private'` and stores only a **pathname**, which is useless on
 * its own. A reader has to ask signedPhotoUrl() for a short-lived signed
 * URL, and only the authenticated admin endpoint does that.
 *
 * Everything a gallery, an avatar or a business cover holds is public by
 * design (it's published on a page anyone can open) and keeps using
 * blob-storage.ts.
 */
export async function uploadPrivateBase64Photo(
  dataUrl: string,
  folder: string,
): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new ValidationError(
      'Formato de imagen inválido (se esperaba un data URL base64).',
    );
  }
  const [, mimeType, base64Data] = match;
  const extension = mimeType.split('/')[1] ?? 'jpg';
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = await put(`${folder}/${ulid().toLowerCase()}.${extension}`, buffer, {
    access: 'private',
    contentType: mimeType,
    addRandomSuffix: false,
  });
  // The pathname, not blob.url: a private blob's plain URL returns 401,
  // and persisting one would only invite someone to try it.
  return blob.pathname;
}

/**
 * How a stored image reference has to be read back. Three shapes exist in
 * the database because two of them predate this module, and the admin
 * panel has to keep displaying all of them:
 *
 * - `data`    — inline base64, from the very first version of the app.
 *               Private in practice: it never left our database, and only
 *               the authenticated admin endpoint returns it.
 * - `public`  — an https URL on the public blob store, from the version
 *               that moved photos out of the database. Still readable by
 *               anyone who has the URL; see secureLegacyVerificationPhotos.
 * - `private` — a bare pathname written by uploadPrivateBase64Photo,
 *               readable only through a signed URL.
 */
export type StoredPhotoKind = 'data' | 'public' | 'private';

export function classifyStoredPhoto(value: string): StoredPhotoKind {
  if (value.startsWith('data:')) return 'data';
  if (/^https?:\/\//.test(value)) return 'public';
  return 'private';
}

/**
 * Turns whatever is stored into something an admin's browser can render:
 * a fresh short-lived signed URL for a private pathname, and the value
 * itself for the two legacy shapes.
 *
 * Returns null when a private blob can't be signed — a missing Blob
 * store, expired credentials, a deleted object. The caller shows a
 * placeholder instead; one unviewable photo must not take down the whole
 * verifications list.
 */
export async function signedPhotoUrl(value: string): Promise<string | null> {
  if (classifyStoredPhoto(value) !== 'private') return value;
  try {
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const token = await issueSignedToken({
      pathname: value,
      operations: ['get'],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: 'get',
      access: 'private',
      pathname: value,
      validUntil,
    });
    return presignedUrl;
  } catch {
    return null;
  }
}

/**
 * Moves an image that was written to the public store into the private
 * one, and deletes the public original. Used to re-secure the
 * verification photos uploaded before this module existed, which are
 * still readable by anyone holding their URL.
 *
 * The delete happens only after the copy succeeds, so a failure halfway
 * leaves the original reachable rather than losing the image. Calling it
 * again on the same row is harmless: a value that isn't a public URL is
 * returned untouched.
 */
export async function moveToPrivateStorage(
  value: string,
  folder: string,
): Promise<string> {
  if (classifyStoredPhoto(value) !== 'public') return value;

  const extension = value.split('.').pop()?.split('?')[0] ?? 'jpg';
  const target = `${folder}/${ulid().toLowerCase()}.${extension}`;
  const copied = await copy(value, target, { access: 'private' });
  try {
    await del(value);
  } catch {
    // The copy is what matters; an orphaned public object is a cleanup
    // problem, not a reason to leave the row pointing at it.
  }
  return copied.pathname;
}
