import { escapeHtml, sendEmail } from './send-email';
import type { EmailResult } from './send-email';

export type TrialEmailStage = '7d' | '1d' | 'ended';

/**
 * The three emails about a business's free month of the page editor:
 * a week before it ends, the day before, and once it's over.
 *
 * They say plainly what happens and what doesn't: the page stays online,
 * only its look goes back to the standard one, and the business's own
 * design is kept for when it activates VIP. Nobody should read "your
 * trial ends" as "your business disappears".
 */
export function trialEmailContent(params: {
  stage: TrialEmailStage;
  businessName: string;
  trialEndsAt: Date;
  appUrl: string;
  monthlyPrice: string;
  annualPrice: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.businessName);
  const endDay = params.trialEndsAt.toLocaleDateString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Mexico_City',
  });
  const prices = `VIP cuesta <strong>${escapeHtml(params.monthlyPrice)} al mes</strong> o <strong>${escapeHtml(params.annualPrice)} al año</strong>.`;
  const howToPay =
    'Para activarlo responde a este correo y te decimos cómo pagar; en cuanto se confirme, tu diseño vuelve a verse tal como lo dejaste.';
  const button = `<p><a href="${params.appUrl}" style="display:inline-block;padding:12px 18px;background:#C8492A;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:bold;">Abrir PawMates</a></p>`;

  switch (params.stage) {
    case '7d':
      return {
        subject: `Te quedan 7 días de prueba gratis en PawMates`,
        html: `
          <p>Hola, <strong>${name}</strong>:</p>
          <p>Tu prueba gratis del editor de páginas termina el <strong>${endDay}</strong>.
          Aprovecha estos días para dejar tu página como la quieres: portada, precios, preguntas frecuentes, promociones, redes y colores.</p>
          <p>Cuando termine, tu página <strong>sigue en línea</strong>, pero con el diseño estándar de PawMates.
          Tu diseño queda guardado. ${prices}</p>
          ${button}
        `,
      };
    case '1d':
      return {
        subject: `Mañana termina tu prueba gratis en PawMates`,
        html: `
          <p>Hola, <strong>${name}</strong>:</p>
          <p>Tu prueba gratis del editor de páginas termina mañana, <strong>${endDay}</strong>.</p>
          <p>Tu página seguirá en línea con el diseño estándar de PawMates, y tu diseño quedará guardado.
          Si quieres que tus clientes lo sigan viendo, activa VIP. ${prices} ${howToPay}</p>
          ${button}
        `,
      };
    case 'ended':
      return {
        subject: `Terminó tu prueba gratis: tu diseño está guardado`,
        html: `
          <p>Hola, <strong>${name}</strong>:</p>
          <p>Terminó tu mes de prueba del editor de páginas. Tu página <strong>sigue en línea</strong> y tus clientes pueden encontrarte como siempre;
          ahora se ve con el diseño estándar de PawMates.</p>
          <p>Todo lo que diseñaste está guardado. ${prices} ${howToPay}</p>
          ${button}
        `,
      };
  }
}

export function sendTrialEmail(
  to: string,
  content: { subject: string; html: string },
): Promise<EmailResult> {
  return sendEmail({ to, subject: content.subject, html: content.html });
}
