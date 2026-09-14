import { ValidationError } from '@pawmates/common';
import { EmailVerificationCode } from './email-verification-code.entity';

describe('EmailVerificationCode', () => {
  it('issues a 6-digit code that is not yet consumed', () => {
    const record = EmailVerificationCode.issue('account-1');
    expect(record.code).toMatch(/^\d{6}$/);
    expect(record.consumedAt).toBeNull();
    expect(record.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('accepts the matching, unexpired, unconsumed code', () => {
    const record = EmailVerificationCode.issue('account-1');
    expect(() => record.assertValid(record.code)).not.toThrow();
  });

  it('rejects a wrong code', () => {
    const record = EmailVerificationCode.issue('account-1');
    expect(() => record.assertValid('000000' === record.code ? '111111' : '000000')).toThrow(
      ValidationError,
    );
  });

  it('rejects an expired code', () => {
    const record = EmailVerificationCode.issue('account-1');
    record.expiresAt = new Date(Date.now() - 1000);
    expect(() => record.assertValid(record.code)).toThrow(ValidationError);
  });

  it('rejects an already-consumed code', () => {
    const record = EmailVerificationCode.issue('account-1');
    record.consume();
    expect(record.consumedAt).not.toBeNull();
    expect(() => record.assertValid(record.code)).toThrow(ValidationError);
  });
});
