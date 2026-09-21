import { Money, ValidationError } from '@pawmates/common';
import { ProviderProfile } from './provider-profile.entity';
import { DEFAULT_PAGE_DESIGN, PAGE_SECTIONS } from '../value-objects/page-design';

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

  it('publishes a walker once name, bio and price are all set', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({
      businessName: 'Paseos Lucía',
      bio: 'Paseadora de tiempo completo.',
      price: Money.of(85000, 'MXN'),
    });
    expect(profile.isPublished).toBe(true);
    expect(profile.price?.equals(Money.of(85000, 'MXN'))).toBe(true);
  });

  it('unpublishes a walker again if the price is cleared', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({
      businessName: 'Paseos Lucía',
      bio: 'Paseadora de tiempo completo.',
      price: Money.of(85000, 'MXN'),
    });
    profile.update({ price: null });
    expect(profile.isPublished).toBe(false);
    expect(profile.price).toBeNull();
  });

  it('defaults to the walker category', () => {
    expect(ProviderProfile.draft('account-1').category).toBe('walker');
  });

  it('publishes a non-walker business without any rate — only walkers get booked', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({
      category: 'vet',
      businessName: 'Veterinaria San Ángel',
      bio: 'Consultas, vacunas y cirugía.',
    });
    expect(profile.isPublished).toBe(true);
    expect(profile.price).toBeNull();
  });

  it('stays unpublished without a business name, whatever the category', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ category: 'grooming', bio: 'Baño y corte.' });
    expect(profile.isPublished).toBe(false);
  });

  it('rejects an unknown category', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(() => profile.update({ category: 'taquería' })).toThrow(ValidationError);
  });

  it('keeps the gallery as a list and caps it at 8 photos', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(profile.photos).toEqual([]);
    profile.update({ photos: ['https://blob.test/a.jpg', 'https://blob.test/b.jpg'] });
    expect(profile.photos).toEqual(['https://blob.test/a.jpg', 'https://blob.test/b.jpg']);
    expect(() => profile.update({ photos: new Array(9).fill('https://blob.test/x.jpg') })).toThrow(
      ValidationError,
    );
  });

  it('accepts the micro-page contact fields', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({
      publicAddress: 'Av. Reforma 222, CDMX',
      hours: 'Lun a Sáb, 9:00 a 19:00',
      whatsapp: '5215512345678',
    });
    expect(profile.publicAddress).toBe('Av. Reforma 222, CDMX');
    expect(profile.hours).toBe('Lun a Sáb, 9:00 a 19:00');
    expect(profile.whatsapp).toBe('5215512345678');
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

  it('accepts the private trust/verification fields without affecting publish state', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({ address: 'Calle Falsa 123', idNumber: 'INE-ABC123', age: 30, phone: '5512345678' });
    expect(profile.address).toBe('Calle Falsa 123');
    expect(profile.idNumber).toBe('INE-ABC123');
    expect(profile.age).toBe(30);
    expect(profile.phone).toBe('5512345678');
    expect(profile.isPublished).toBe(false); // still no name/bio/price
  });

  it('rejects an age outside 18-90', () => {
    const profile = ProviderProfile.draft('account-1');
    expect(() => profile.update({ age: 17 })).toThrow(ValidationError);
    expect(() => profile.update({ age: 91 })).toThrow(ValidationError);
  });

  describe('plan and page design', () => {
    it('starts on the free plan with PawMates\' own design', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(profile.plan).toBe('free');
      expect(profile.effectiveDesign).toEqual(DEFAULT_PAGE_DESIGN);
      expect(profile.hasUnpublishedDesign).toBe(false);
    });

    it('refuses to customize the page on the free plan', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(() => profile.saveDesignDraft({ template: 'gallery' })).toThrow(ValidationError);
      expect(() => profile.publishDesign()).toThrow(ValidationError);
    });

    it('keeps a VIP draft off the live page until it is published', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');

      profile.saveDesignDraft({ template: 'gallery', primaryColor: '#123456' });
      expect(profile.draftDesign.template).toBe('gallery');
      expect(profile.hasUnpublishedDesign).toBe(true);
      expect(profile.effectiveDesign).toEqual(DEFAULT_PAGE_DESIGN); // still the default live

      profile.publishDesign();
      expect(profile.effectiveDesign.template).toBe('gallery');
      expect(profile.effectiveDesign.primaryColor).toBe('#123456');
      expect(profile.hasUnpublishedDesign).toBe(false);
    });

    it('stops serving a custom design after a downgrade, without losing it', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');
      profile.saveDesignDraft({ template: 'minimal' });
      profile.publishDesign();

      profile.setPlan('free');
      expect(profile.effectiveDesign).toEqual(DEFAULT_PAGE_DESIGN);

      profile.setPlan('vip');
      expect(profile.effectiveDesign.template).toBe('minimal');
    });

    it('rejects an unknown plan', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(() => profile.setPlan('platino')).toThrow(ValidationError);
    });

    it('rejects an invalid template, font or color', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');
      expect(() => profile.saveDesignDraft({ template: 'neon' })).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft({ font: 'comic' })).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft({ primaryColor: 'rojo' })).toThrow(ValidationError);
    });

    it('fills in sections the client left out instead of dropping them', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');
      profile.saveDesignDraft({ sections: [{ id: 'gallery', enabled: false }] });

      const ids = profile.draftDesign.sections.map((s) => s.id);
      expect(ids[0]).toBe('gallery'); // the order the client sent wins
      expect(new Set(ids)).toEqual(new Set(PAGE_SECTIONS));
      expect(profile.draftDesign.sections.find((s) => s.id === 'gallery')?.enabled).toBe(false);
      expect(profile.draftDesign.sections.find((s) => s.id === 'hours')?.enabled).toBe(true);
    });

    it('caps testimonials and requires text on each', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');
      profile.saveDesignDraft({ testimonials: [{ text: 'Excelente trato', author: 'Ana' }] });
      expect(profile.draftDesign.testimonials).toEqual([{ text: 'Excelente trato', author: 'Ana' }]);

      expect(() => profile.saveDesignDraft({ testimonials: [{ author: 'Ana' }] })).toThrow(ValidationError);
      expect(() =>
        profile.saveDesignDraft({ testimonials: new Array(7).fill({ text: 'x', author: 'y' }) }),
      ).toThrow(ValidationError);
    });
  });

  it('accepts the public plans/spots fields', () => {
    const profile = ProviderProfile.draft('account-1');
    profile.update({
      plansOffered: 'Paseo individual 30 min, plan semanal 3x',
      walkingSpots: 'Parque México, Parque España',
    });
    expect(profile.plansOffered).toBe('Paseo individual 30 min, plan semanal 3x');
    expect(profile.walkingSpots).toBe('Parque México, Parque España');
  });
});
