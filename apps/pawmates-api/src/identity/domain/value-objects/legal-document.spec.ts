import { ValidationError } from '@pawmates/common';
import {
  LEGAL_DOCUMENT_VERSIONS,
  assertLegalDocumentType,
  documentsRequiredFor,
  isCurrentVersion,
} from './legal-document';

describe('legal documents', () => {
  it('asks an owner for the privacy notice and the owner terms', () => {
    expect(documentsRequiredFor('owner')).toEqual(['privacy_notice', 'owner_terms']);
  });

  it('asks a provider for the privacy notice and the provider agreement', () => {
    expect(documentsRequiredFor('provider')).toEqual([
      'privacy_notice',
      'provider_agreement',
    ]);
  });

  it('never bundles the identity-verification consent into a general acceptance', () => {
    // The law wants that one expressed separately, so it can't ride along
    // with signup for either role — AuthController adds it only when the
    // photos are actually sent.
    expect(documentsRequiredFor('owner')).not.toContain('identity_verification_consent');
    expect(documentsRequiredFor('provider')).not.toContain(
      'identity_verification_consent',
    );
  });

  it('rejects a document type it does not know', () => {
    expect(() => assertLegalDocumentType('contrato_secreto')).toThrow(ValidationError);
  });

  it('only treats the version in force as current', () => {
    expect(isCurrentVersion('privacy_notice', LEGAL_DOCUMENT_VERSIONS.privacy_notice)).toBe(
      true,
    );
    expect(isCurrentVersion('privacy_notice', '0.9')).toBe(false);
  });

  it('declares a version for every document', () => {
    for (const [type, version] of Object.entries(LEGAL_DOCUMENT_VERSIONS)) {
      expect(version).toMatch(/^\d+\.\d+$/);
      expect(isCurrentVersion(type as never, version)).toBe(true);
    }
  });
});
