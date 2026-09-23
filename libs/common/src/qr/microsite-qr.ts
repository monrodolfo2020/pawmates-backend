import * as QRCode from 'qrcode';

const APP_URL = () => (process.env.APP_URL ?? 'https://pawmates-one.vercel.app').replace(/\/$/, '');

/** The public address a business's QR code points to. */
export function micrositeUrlFor(slug: string): string {
  return `${APP_URL()}/s/${slug}`;
}

/**
 * The QR code for a business's page, as a PNG.
 *
 * 1024px with a quiet margin, so it survives being printed on a flyer or
 * a counter sticker; error correction "Q" (25%) so it still scans when
 * the print is smudged, folded or partly covered, which is how QR codes
 * on a pet shop's counter actually end up.
 */
export function micrositeQrPng(slug: string): Promise<Buffer> {
  return QRCode.toBuffer(micrositeUrlFor(slug), {
    type: 'png',
    width: 1024,
    margin: 3,
    errorCorrectionLevel: 'Q',
    color: { dark: '#1D1533', light: '#FFFFFF' },
  });
}
