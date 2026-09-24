import { escapeHtml, sendEmail } from './send-email';
import type { EmailResult } from './send-email';

export type PhotoFeedback = 'retake_selfie' | 'retake_id' | 'mismatch';

/**
 * Tells a business, right after it sent its verification photos, that
 * the automatic comparison found something it can fix — the same words
 * its panel shows (VerificationCard). Never the percentage: that would
 * only help someone tune a fake until it passes.
 */
export function photoFeedbackEmailContent(params: {
  feedback: PhotoFeedback;
  businessName: string;
  appUrl: string;
}): { subject: string; html: string } {
  const name = escapeHtml(params.businessName);
  const advice: Record<PhotoFeedback, string> = {
    retake_selfie:
      'No logramos ver bien tu cara en la foto que enviaste. Tómala de frente, con buena luz, sin lentes oscuros ni gorra, y envíala de nuevo desde tu panel.',
    retake_id:
      'No logramos ver la foto de tu identificación. Tómala completa, enfocada y sin reflejos, y envíala de nuevo desde tu panel.',
    mismatch:
      'Tu cara no parece coincidir con la foto de tu identificación. Si enviaste una foto equivocada, puedes mandar otras desde tu panel. Si son correctas —por ejemplo, tu credencial es de hace años—, no tienes que hacer nada: una persona de nuestro equipo las va a revisar.',
  };
  return {
    subject:
      params.feedback === 'mismatch'
        ? 'Revisa las fotos de tu verificación en PawMates'
        : 'Necesitamos otra foto para verificar tu identidad',
    html: `
      <p>Hola, <strong>${name}</strong>:</p>
      <p>${advice[params.feedback]}</p>
      <p>La verificación es opcional: tu página funciona igual mientras tanto. Lo único que da es la insignia de "Identidad verificada".</p>
      <p><a href="${params.appUrl}" style="display:inline-block;padding:12px 18px;background:#C8492A;color:#ffffff;border-radius:10px;text-decoration:none;font-weight:bold;">Abrir mi panel</a></p>
    `,
  };
}

export function sendPhotoFeedbackEmail(
  to: string,
  content: { subject: string; html: string },
): Promise<EmailResult> {
  return sendEmail({ to, subject: content.subject, html: content.html });
}
