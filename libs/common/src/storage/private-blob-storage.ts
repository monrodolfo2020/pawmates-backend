import { del, issueSignedToken, presignUrl, put } from '@vercel/blob';
import { ulid } from 'ulid';
import { ValidationError } from '../errors/domain-error';

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/** How long a signed link to a private image stays usable. Short on
 * purpose: it exists so one admin can look at one photo in one sitting,
 * and a link that leaks should stop working before it can be passed on. */
const SIGNED_URL_TTL_MS = 10 * 60 * 1000;

/**
 * How long to wait for the private upload before giving up and keeping
 * the image inline. Signup uploads two photos in sequence and the
 * function's own budget is 30s, so this has to leave room for the rest
 * of the request: a blob store that is slow or unreachable must not be
 * able to hold a signup open until the whole function times out.
 */
const UPLOAD_TIMEOUT_MS = 8000;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`La subida excedió ${ms} ms.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Private access is a property of the **store**, not of an individual
 * blob: a public store refuses a private write outright ("Cannot use
 * private access on a public store"). The app's galleries, avatars and
 * covers belong in a public store — they're published on pages anyone
 * can open — so the identity photos need a second store, created with
 * private access and connected to the project, and writes have to be
 * pointed at it explicitly with its own token.
 *
 * When that variable isn't set there is no private store to write to, so
 * the images stay inside our own database instead (see
 * uploadPrivateBase64Photo). Set it and they move to object storage with
 * no code change.
 */
function privateStoreToken(): string | undefined {
  return process.env.BLOB_PRIVATE_READ_WRITE_TOKEN?.trim() || undefined;
}

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

  const token = privateStoreToken();
  if (!token) {
    // No private store configured. Keeping the image in our own
    // database is the correct answer, not a degraded one: it's reachable
    // only through the authenticated admin endpoint, where a write to
    // the public store would be openable by anyone holding the URL.
    return dataUrl;
  }

  try {
    const blob = await withTimeout(
      put(`${folder}/${ulid().toLowerCase()}.${extension}`, buffer, {
        access: 'private',
        token,
        contentType: mimeType,
        addRandomSuffix: false,
      }),
      UPLOAD_TIMEOUT_MS,
    );
    // The pathname, not blob.url: a private blob's plain URL returns 401,
    // and persisting one would only invite someone to try it.
    return blob.pathname;
  } catch (error) {
    // A configured private store that refuses the write or doesn't
    // answer — wrong token, wrong store, quota, an outage. Rather than
    // fail the signup, which is what happened the first time this
    // shipped, keep the image inline.
    //
    // Never falls back to the public store. Being heavier to store is a
    // cost; being openable by anyone holding a URL is the exact thing
    // this module exists to prevent.
    console.error(
      '[private-blob-storage] private upload failed, keeping the image inline instead',
      error,
    );
    return dataUrl;
  }
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
  const storeToken = privateStoreToken();
  if (!storeToken) return null; // nothing to sign against any more
  try {
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const token = await issueSignedToken({
      pathname: value,
      token: storeToken,
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
 * Takes an image that was written to the public store, puts it somewhere
 * private, and deletes the public original. Used to re-secure the
 * identity photos uploaded before this module existed, which anyone
 * holding their URL can still open.
 *
 * It downloads the object and re-uploads it through
 * uploadPrivateBase64Photo rather than copying within the store, because
 * private access is a store-level property: there is nothing private to
 * copy *to* inside a public store. Routing it through the same upload
 * path means this works in both configurations — into the private store
 * when one is configured, into our own database when not — and in
 * neither case does the image keep a public address.
 *
 * The delete happens only after the image is safely stored elsewhere, so
 * a failure halfway leaves the original reachable rather than losing it.
 * Calling it again on the same value is harmless: anything that isn't a
 * public URL is returned untouched.
 */
export async function moveToPrivateStorage(
  value: string,
  folder: string,
): Promise<string> {
  if (classifyStoredPhoto(value) !== 'public') return value;

  const response = await fetch(value);
  if (!response.ok) {
    throw new Error(
      `No se pudo descargar la imagen a resguardar (HTTP ${response.status}).`,
    );
  }
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
  const stored = await uploadPrivateBase64Photo(
    `data:${contentType};base64,${base64}`,
    folder,
  );

  try {
    await del(value);
  } catch {
    // Storing it privately is what matters; an orphaned public object is
    // a cleanup problem, not a reason to leave the row pointing at it.
  }
  return stored;
}

/**
 * Deletes a stored image, whatever shape it was kept in. Inline base64
 * needs nothing done — clearing the column is the deletion — while a
 * blob has to be removed from its store.
 *
 * Never throws: the caller clears the column either way, and a row still
 * pointing at an image we meant to destroy is worse than an orphaned
 * object.
 */
export async function deleteStoredPhoto(value: string | null): Promise<void> {
  if (!value) return;
  const kind = classifyStoredPhoto(value);
  if (kind === 'data') return;
  try {
    const token = kind === 'private' ? privateStoreToken() : undefined;
    await del(value, token ? { token } : undefined);
  } catch {
    // Best effort by design — see the note above.
  }
}

/**
 * The bytes of a stored photo, wherever it lives (inline data URL, the
 * old public store, or the private one). null when it can't be read —
 * the caller decides what that means.
 */
export async function readStoredPhoto(value: string | null): Promise<Buffer | null> {
  if (!value) return null;
  const kind = classifyStoredPhoto(value);
  if (kind === 'data') {
    const match = DATA_URL_PATTERN.exec(value);
    return match ? Buffer.from(match[2], 'base64') : null;
  }
  const url = kind === 'private' ? await signedPhotoUrl(value) : value;
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
