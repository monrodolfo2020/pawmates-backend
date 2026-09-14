import { Money, ValidationError } from '@pawmates/common';
import { ProviderProfile } from './provider-profile.entity';

describe('ProviderProfile aggregate', () => {
  it('starts as an unpublished draft with a generated id', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(profile.id).toBeTruthy();
    expect(profile.accountId).toBe('account-1');
    expect(profile.isPublished).toBe(false);
    expect(profile.price).toBeNull();
  });

  it('stays unpublished with only a bio set', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ bio: 'Paseadora de tiempo completo.' });
    expect(profile.isPublished).toBe(false);
  });

  it('stays unpublished with only a price set', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ price: Money.of(85000, 'MXN') });
    expect(profile.isPublished).toBe(false);
  });

  it('publishes automatically once both bio and price are set', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ bio: 'Paseadora de tiempo completo.', price: Money.of(85000, 'MXN') });
    expect(profile.isPublished).toBe(true);
    expect(profile.price?.equals(Money.of(85000, 'MXN'))).toBe(true);
  });

  it('unpublishes again if the price is cleared', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ bio: 'Paseadora de tiempo completo.', price: Money.of(85000, 'MXN') });
    profile.update({ price: null });
    expect(profile.isPublished).toBe(false);
    expect(profile.price).toBeNull();
  });

  it('leaves omitted fields untouched', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ bio: 'Bio', serviceArea: 'Roma Norte', specialty: 'Perros grandes' });
    profile.update({ price: Money.of(1000, 'MXN') });
    expect(profile.bio).toBe('Bio');
    expect(profile.serviceArea).toBe('Roma Norte');
    expect(profile.specialty).toBe('Perros grandes');
  });

  it('rejects an empty bio', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(() => profile.update({ bio: '' })).toThrow(ValidationError);
  });

  it('rejects a bio over 600 characters', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(() => profile.update({ bio: 'x'.repeat(601) })).toThrow(ValidationError);
  });

  it('rejects an empty service area', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(() => profile.update({ serviceArea: '' })).toThrow(ValidationError);
  });
});
