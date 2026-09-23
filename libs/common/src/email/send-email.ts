// Overridable so the email flows can be exercised against a local stand-in
// instead of sending real mail; production leaves it unset.
const RESEND_API_URL = () =>
  process.env.RESEND_API_URL ?? 'https://api.resend.com/emails';

/**
 * Who the email says it's from, and where a reply goes.
 *
 * EMAIL_FROM must be on a domain verified in Resend, e.g.
 * "PawMates <notificaciones@midominio.com>". EMAIL_REPLY_TO, when set,
 * sends replies somewhere else — useful when the sending domain belongs
 * to another project and its inboxes aren't PawMates'.
 */
export function senderFields(): { from: string; reply_to?: string } {
  const from =
    process.env.EMAIL_FROM?.trim() || 'PawMates <onboarding@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  return replyTo ? { from, reply_to: replyTo } : { from };
}

export type EmailAttachment = {
  filename: string;
  /** Base64 content. */
  content: string;
};

export type EmailResult = { sent: true } | { sent: false; reason: string };

/**
 * Sends one email through Resend and **reports** the outcome instead of
 * throwing.
 *
 * The two older senders throw on failure because their callers wanted
 * that. These newer ones are side effects of something more important —
 * a signup, an approval — which must succeed whether or not the email
 * goes out. So the result says what happened, and the caller decides
 * whether to tell anyone.
 *
 * Worth knowing when reading a failure: with Resend's test sender
 * (the default below, on resend.dev) Resend only delivers to the address
 * that owns the Resend account. Mail to anyone else needs EMAIL_FROM on a
 * domain verified in Resend.
 */
export async function sendEmail(params: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY no configurado — "${params.subject}" para ${String(params.to)}`,
    );
    return { sent: false, reason: 'El envío de correos no está configurado.' };
  }
  try {
    const res = await fetch(RESEND_API_URL(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...senderFields(),
        to: params.to,
        subject: params.subject,
        html: params.html,
        attachments: params.attachments,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');

      console.error(`[email] Resend respondió ${res.status}: ${body}`);
      return { sent: false, reason: explainResendFailure(res.status, body) };
    }
    return { sent: true };
  } catch (error) {
    console.error('[email] no se pudo contactar a Resend', error);
    return {
      sent: false,
      reason: 'No se pudo contactar al servicio de correo.',
    };
  }
}

/** Turns the failure people actually hit into something they can act on. */
function explainResendFailure(status: number, body: string): string {
  if (
    status === 403 &&
    /own email|testing emails|verify a domain/i.test(body)
  ) {
    return 'El remitente de pruebas de Resend solo puede escribirle a tu propio correo. Verifica un dominio en Resend y configura EMAIL_FROM para escribirle a otras personas.';
  }
  return `El servicio de correo respondió con un error (${status}).`;
}

/** Keeps business-supplied text from being read as HTML in an email. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
