import { ValidationError } from '@pawmates/common';

/**
 * The documents a person has to accept, and the version of each that is
 * currently in force.
 *
 * Versions live here, in the backend, because acceptance is evidence:
 * the record has to say which text was accepted, and that can't be
 * decided by whatever the client happens to have bundled. The client
 * reads the current versions from GET /v1/legal/documents, shows those
 * texts, and echoes them back when it accepts — a mismatch is refused,
 * so an old app build can't produce a record claiming someone accepted
 * a document they never saw.
 *
 * **Bump the version whenever the text changes.** Doing so makes the
 * document show up as pending for everyone who accepted the previous
 * one, which is the point.
 *
 * Must match LEGAL_DOCUMENTS in the frontend's api/client.ts (checked by the app repo's scripts/check-shared-lists.mjs, which CI runs)
 * and the texts bundled in the frontend's src/legal/.
 */
export const LEGAL_DOCUMENTS = [
  'privacy_notice',
  'provider_agreement',
  'owner_terms',
  'identity_verification_consent',
] as const;

export type LegalDocumentType = (typeof LEGAL_DOCUMENTS)[number];

export const LEGAL_DOCUMENT_VERSIONS: Record<LegalDocumentType, string> = {
  privacy_notice: '1.0',
  provider_agreement: '1.1',
  owner_terms: '1.0',
  identity_verification_consent: '1.0',
};

export const LEGAL_DOCUMENT_TITLES: Record<LegalDocumentType, string> = {
  privacy_notice: 'Aviso de Privacidad',
  provider_agreement: 'Acuerdo de Prestadores de Servicios',
  owner_terms: 'Términos y Condiciones',
  identity_verification_consent:
    'Consentimiento para la verificación de identidad',
};

/**
 * What each kind of account has to accept before it exists. Note that
 * 'identity_verification_consent' is in neither list: handing over a
 * face and an ID document is optional, and the law wants that consent
 * expressed separately rather than bundled into a general acceptance, so
 * it's required only when those photos are actually sent.
 */
export function documentsRequiredFor(
  role: 'owner' | 'provider',
): LegalDocumentType[] {
  return role === 'provider'
    ? ['privacy_notice', 'provider_agreement']
    : ['privacy_notice', 'owner_terms'];
}

export function assertLegalDocumentType(
  value: string,
): asserts value is LegalDocumentType {
  if (!LEGAL_DOCUMENTS.includes(value as LegalDocumentType)) {
    throw new ValidationError('Ese documento legal no existe.');
  }
}

/** True when `version` is the one currently in force for that document. */
export function isCurrentVersion(
  type: LegalDocumentType,
  version: string,
): boolean {
  return LEGAL_DOCUMENT_VERSIONS[type] === version;
}
