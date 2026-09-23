import { senderFields } from './send-email';

// Sends a verification code by email via Resend's REST API — a plain
// `fetch` call rather than pulling in their SDK, since the whole
// integration is one POST (same "don't add a dependency for one call"
// call this repo already made for Blob's put()... except Blob's SDK was
// worth it for its OIDC credential handling; Resend's API needs nothing
// beyond a Bearer token, so raw fetch stays simpler here).
//
// RESEND_API_KEY unset (e.g. local dev, or before the account behind
// this deployment has been configured) means there's no way to actually
// deliver anything — this logs the code instead of throwing, so
// signup/verification flows keep working end-to-end without a real
// provider wired up; the account just won't receive a real email until
// one is.
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY no configurado — código de verificación para ${to}: ${code}`,
    );
    return;
  }
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...senderFields(),
      to,
      subject: 'Tu código de verificación de PawMates',
      html: `
        <p>Tu código de verificación de PawMates es:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
        <p>Vence en 15 minutos. Si tú no pediste esto, ignora este correo.</p>
      `,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `Resend respondió ${res.status} al enviar el correo de verificación: ${body}`,
    );
  }
}
