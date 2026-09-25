import { escapeHtml, sendEmail } from './send-email';
import type { EmailResult } from './send-email';

/** Tells the admins a business is waiting for them. */
export function sendNewBusinessPendingEmail(params: {
  to: string[];
  businessName: string;
  ownerName: string | null;
  email: string;
  category: string;
  adminUrl: string;
}): Promise<EmailResult> {
  const name = escapeHtml(params.businessName);
  return sendEmail({
    to: params.to,
    subject: `Nuevo negocio esperando aprobación: ${params.businessName}`,
    html: `
      <p>Se registró un negocio nuevo en PawMates y está esperando tu aprobación para aparecer en el directorio.</p>
      <p>
        <strong>${name}</strong><br/>
        ${escapeHtml(params.category)}<br/>
        ${params.ownerName ? `${escapeHtml(params.ownerName)} · ` : ''}${escapeHtml(params.email)}
      </p>
      <p>Mientras tanto ya puede entrar y preparar su página, pero nadie más la ve.</p>
      <p><a href="${params.adminUrl}" style="font-size:16px;font-weight:bold;">Revisar en el panel</a></p>
    `,
  });
}

/**
 * Confirms to a business, right after it signs up, that the registration
 * went through — and what happens next, since its page isn't public until
 * an admin approves it. Without this, nothing told them they were in.
 */
export function sendBusinessWelcomeEmail(params: {
  to: string;
  businessName: string;
  appUrl: string;
}): Promise<EmailResult> {
  const name = escapeHtml(params.businessName);
  return sendEmail({
    to: params.to,
    subject: `Recibimos el registro de ${params.businessName} en PawMates`,
    html: `
      <p>¡Hola! Registramos <strong>${name}</strong> en PawMates.</p>
      <p>Esto es lo que sigue:</p>
      <ol>
        <li><strong>Verifica tu correo</strong> con el código de 6 dígitos que te mandamos aparte.</li>
        <li><strong>Completa tu página</strong> desde tu panel: descripción, fotos, servicios y WhatsApp. Tienes 30 días para diseñarla gratis a tu gusto, que empiezan a contar cuando aprobemos tu negocio.</li>
        <li><strong>Revisamos tu negocio.</strong> En cuanto lo aprobemos te escribimos con tu enlace y tu código QR para compartir.</li>
      </ol>
      <p><a href="${params.appUrl}" style="display:inline-block;padding:12px 18px;background:#C8492A;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:bold;">Abrir mi panel</a></p>
      <p>Si tú no creaste esta cuenta, responde a este correo y la revisamos.</p>
    `,
  });
}

/**
 * Tells a business it has been approved, with its link and its QR code.
 *
 * The QR goes out twice on purpose: as an image in the body, for anyone
 * who just wants to look at it, and as a PNG attachment, which is what
 * someone actually needs in order to print it on a flyer or a sticker.
 * The image in the body is a URL to our own server rather than inline
 * data, because Gmail strips inline data images.
 */
export function sendBusinessApprovedEmail(params: {
  to: string;
  businessName: string;
  pageUrl: string;
  qrImageUrl: string;
  qrPngBase64: string;
  /** False when the business was approved but hasn't finished its page:
   * the link would 404 today, so the email says what's missing instead
   * of sending them to an empty address. */
  pageIsLive: boolean;
}): Promise<EmailResult> {
  const name = escapeHtml(params.businessName);
  const body = params.pageIsLive
    ? `
      <p>¡Listo! <strong>${name}</strong> ya está en línea en PawMates.</p>
      <p>Este es el enlace de tu página. Compártelo en tus redes, por WhatsApp o con tus clientes:</p>
      <p><a href="${params.pageUrl}" style="font-size:16px;font-weight:bold;">${params.pageUrl}</a></p>
      <p>Y este es tu código QR. Imprímelo en tu mostrador, tus tarjetas o tus volantes: quien lo escanee llega directo a tu página.
      También te lo mandamos adjunto, listo para imprimir.</p>
      <p><img src="${params.qrImageUrl}" width="240" height="240" alt="Código QR de tu página" /></p>
    `
    : `
      <p>¡Buenas noticias! Aprobamos <strong>${name}</strong> en PawMates.</p>
      <p>Solo falta que completes tu página —el nombre del negocio y una descripción— para que aparezca en el directorio.
      En cuanto lo hagas, este enlace mostrará tu página:</p>
      <p><a href="${params.pageUrl}">${params.pageUrl}</a></p>
      <p>Te adjuntamos tu código QR para que lo tengas listo.</p>
      <p><img src="${params.qrImageUrl}" width="240" height="240" alt="Código QR de tu página" /></p>
    `;
  return sendEmail({
    to: params.to,
    subject: params.pageIsLive
      ? `${params.businessName} ya está en línea en PawMates`
      : `Aprobamos ${params.businessName} en PawMates`,
    html: body,
    attachments: [{ filename: 'codigo-qr-pawmates.png', content: params.qrPngBase64 }],
  });
}
