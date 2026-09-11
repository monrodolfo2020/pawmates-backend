import { put } from '@vercel/blob';
import { ulid } from 'ulid';
import { ValidationError } from '../errors/domain-error';

const DATA_URL_PATTERN = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

/**
 * Uploads a base64 photo (the shape every PhotoPicker in the frontend
 * produces — see resizeImagePhoto.ts) to Vercel Blob and returns its
 * public URL. Every photo-accepting field in this app used to store the
 * base64 itself inline (Pet, ProviderVerification, WalkEvent,
 * CatalogItem, Product) — that bloats every row and every list query
 * that touches one, so new writes go through here instead and only the
 * URL is persisted. Existing rows written before this shipped may still
 * hold inline base64 in the same column — both are valid `<Image
 * source={{uri}}>` values on the frontend, so nothing there needed to
 * change; they're just heavier until whatever wrote them is edited again.
 *
 * Requires BLOB_READ_WRITE_TOKEN (Vercel dashboard → the project →
 * Storage tab → create a Blob store → copy its token into the project's
 * environment variables, then redeploy). Missing it throws rather than
 * silently falling back to inline base64 — better a loud failure than
 * quietly reintroducing the exact problem this exists to fix.
 */
export async function uploadBase64Photo(
  dataUrl: string,
  folder: string,
): Promise<string> {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    throw new ValidationError(
      'Formato de imagen inválido (se esperaba un data URL base64).',
    );
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new ValidationError(
      'El almacenamiento de imágenes no está configurado (falta BLOB_READ_WRITE_TOKEN).',
    );
  }
  const [, mimeType, base64Data] = match;
  const extension = mimeType.split('/')[1] ?? 'jpg';
  const buffer = Buffer.from(base64Data, 'base64');
  const blob = await put(`${folder}/${ulid().toLowerCase()}.${extension}`, buffer, {
    access: 'public',
    contentType: mimeType,
    token,
    addRandomSuffix: false,
  });
  return blob.url;
}

/** True for either an already-uploaded https(s) URL or a data: URL still
 * awaiting upload — used to decide whether a value needs uploadBase64Photo
 * at all (an existing URL passed back unchanged shouldn't be re-uploaded). */
export function isDataUrl(value: string): boolean {
  return value.startsWith('data:');
}

/** Same as uploadBase64Photo, but for a whole gallery (e.g. Product.photos)
 * — a save can resend a mix of already-uploaded URLs (untouched entries)
 * and freshly-picked base64 (new/replaced ones); only the latter get
 * uploaded. */
export async function uploadBase64Photos(
  photos: string[],
  folder: string,
): Promise<string[]> {
  return Promise.all(
    photos.map((photo) => (isDataUrl(photo) ? uploadBase64Photo(photo, folder) : photo)),
  );
}
