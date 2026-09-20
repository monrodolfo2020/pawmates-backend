// Sends a password reset link by email via Resend's REST API — same
// approach and same RESEND_API_KEY-unset fallback as
// send-verification-email.ts (logs instead of throwing, so the flow
// still works end-to-end without a real provider wired up).
const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(`[email] RESEND_API_KEY no configurado — enlace de restablecimiento para ${to}: ${resetLink}`);
    return;
  }
  const from = process.env.EMAIL_FROM ?? 'PawMates <onboarding@resend.dev>';
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Restablece tu contraseña de PawMates',
      html: `
        <p>Recibimos una solicitud para restablecer tu contraseña de PawMates.</p>
        <p><a href="${resetLink}" style="font-size: 16px; font-weight: bold;">Restablecer mi contraseña</a></p>
        <p>Vence en 60 minutos. Si tú no pediste esto, ignora este correo — tu contraseña no cambiará.</p>
      `,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status} al enviar el correo de restablecimiento: ${body}`);
  }
}
