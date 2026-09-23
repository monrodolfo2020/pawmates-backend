import { Money, ValidationError } from '@pawmates/common';
import { ProviderProfile } from './provider-profile.entity';
import { DEFAULT_PAGE_DESIGN, PAGE_SECTIONS } from '../value-objects/page-design';

/** An approved business whose free month of the editor is long gone. */
function pastTrial(): ProviderProfile {
  const profile = ProviderProfile.draft('account-1');
  profile.approvedAt = new Date('2025-01-01T00:00:00Z');
  profile.startTrial(new Date('2025-01-01T00:00:00Z'));
  return profile;
}

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

    it('refuses to customize the page on the free plan once the trial is over', () => {
      const profile = pastTrial();
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
      const profile = pastTrial();
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

  describe('approval', () => {
    const complete = () => {
      const profile = ProviderProfile.draft('account-1');
      profile.update({ category: 'vet', businessName: 'Vet', bio: 'Consultas.' });
      return profile;
    };

    it('starts waiting for approval', () => {
      expect(ProviderProfile.draft('account-1').approvedAt).toBeNull();
    });

    it('keeps a complete page out of sight until it is approved', () => {
      const profile = complete();
      expect(profile.isPublished).toBe(true);
      expect(profile.isPubliclyVisible).toBe(false);
      profile.approvedAt = new Date();
      expect(profile.isPubliclyVisible).toBe(true);
    });

    it('keeps an approved but incomplete page out of sight', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.approvedAt = new Date();
      expect(profile.isPubliclyVisible).toBe(false);
    });
  });

  describe('location', () => {
    it('starts without a location', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(profile.latitude).toBeNull();
      expect(profile.longitude).toBeNull();
    });

    it('stores a point picked off a map search', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.update({ latitude: 19.4126, longitude: -99.1732 });
      expect(profile.latitude).toBeCloseTo(19.4126);
      expect(profile.longitude).toBeCloseTo(-99.1732);
    });

    it('clears the location when both are set to null', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.update({ latitude: 19.4126, longitude: -99.1732 });
      profile.update({ latitude: null, longitude: null });
      expect(profile.latitude).toBeNull();
      expect(profile.longitude).toBeNull();
    });

    it('refuses half a coordinate — a point nowhere is worse than no point', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(() => profile.update({ latitude: 19.4126 })).toThrow(ValidationError);
      expect(() => profile.update({ longitude: -99.1732 })).toThrow(ValidationError);
      expect(profile.latitude).toBeNull();
    });

    it('rejects coordinates outside the globe', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(() => profile.update({ latitude: 91, longitude: 0 })).toThrow(ValidationError);
      expect(() => profile.update({ latitude: 0, longitude: 181 })).toThrow(ValidationError);
      expect(() => profile.update({ latitude: Number.NaN, longitude: 0 })).toThrow(
        ValidationError,
      );
    });

    it('leaves the location alone when neither is mentioned', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.update({ latitude: 19.4126, longitude: -99.1732 });
      profile.update({ bio: 'Otra cosa' });
      expect(profile.latitude).toBeCloseTo(19.4126);
    });
  });

  describe('paid VIP and expiry', () => {
    const march = new Date('2026-03-10T12:00:00Z');

    it('activates VIP for one period and reports when it runs out', () => {
      const profile = ProviderProfile.draft('account-1');
      const until = profile.activateVip('monthly', march);

      expect(profile.plan).toBe('vip');
      expect(until.toISOString()).toBe('2026-04-10T12:00:00.000Z');
      expect(profile.isVip(march)).toBe(true);
    });

    it('stops being VIP once the period is over, without changing the plan', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.activateVip('monthly', march);

      const afterExpiry = new Date('2026-05-01T00:00:00Z');
      expect(profile.isVip(afterExpiry)).toBe(false);
      // The stored plan is untouched, so renewing restores the same page.
      expect(profile.plan).toBe('vip');
    });

    it('serves the default design once VIP lapses, and the custom one again on renewal', () => {
      // saveDesignDraft/effectiveDesign read the clock themselves, so this
      // one has to travel rather than pass a date in.
      jest.useFakeTimers().setSystemTime(march);
      try {
        const profile = pastTrial();
        profile.activateVip('monthly');
        profile.saveDesignDraft({ template: 'minimal' });
        profile.publishDesign();
        expect(profile.effectiveDesign.template).toBe('minimal');

        jest.setSystemTime(new Date('2026-06-01T00:00:00Z')); // VIP ran out Apr 10
        expect(profile.effectiveDesign).toEqual(DEFAULT_PAGE_DESIGN);
        expect(() => profile.saveDesignDraft({ template: 'gallery' })).toThrow(ValidationError);

        profile.activateVip('monthly');
        expect(profile.effectiveDesign.template).toBe('minimal');
      } finally {
        jest.useRealTimers();
      }
    });

    it('stacks an early renewal onto the time left instead of discarding it', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.activateVip('monthly', march); // runs to Apr 10

      const renewedOn = new Date('2026-03-30T12:00:00Z'); // 11 days early
      const until = profile.activateVip('monthly', renewedOn);
      expect(until.toISOString()).toBe('2026-05-10T12:00:00.000Z');
    });

    it('starts a lapsed plan over from today rather than backdating it', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.activateVip('monthly', march); // ran out Apr 10

      const renewedOn = new Date('2026-08-01T00:00:00Z');
      const until = profile.activateVip('monthly', renewedOn);
      expect(until.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('treats an admin-granted VIP as never expiring', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.setPlan('vip');

      expect(profile.planExpiresAt).toBeNull();
      expect(profile.isVip(new Date('2099-01-01T00:00:00Z'))).toBe(true);
    });

    it('clears the expiry when an admin drops the business to free', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.activateVip('annual', march);
      profile.setPlan('free');

      expect(profile.planExpiresAt).toBeNull();
      expect(profile.isVip(march)).toBe(false);
    });

    it('rejects an unknown billing period', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(() => profile.activateVip('quincenal')).toThrow(ValidationError);
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

  describe('free trial of the page editor', () => {
    const approvedOn = new Date('2026-03-10T12:00:00Z');

    it('lets a business design its page while it waits for approval', () => {
      const profile = ProviderProfile.draft('account-1');
      expect(profile.canCustomize()).toBe(true);
      profile.saveDesignDraft({ template: 'gallery' });
      profile.publishDesign();
      expect(profile.effectiveDesign.template).toBe('gallery');
    });

    it('gives 30 days from the first approval, and approving again does not restart them', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.approvedAt = approvedOn;
      profile.startTrial(approvedOn);
      expect(profile.trialEndsAt).toEqual(new Date('2026-04-09T12:00:00Z'));
      expect(profile.canCustomize(new Date('2026-04-09T11:59:00Z'))).toBe(true);
      expect(profile.canCustomize(new Date('2026-04-09T12:00:00Z'))).toBe(false);

      profile.startTrial(new Date('2026-05-01T00:00:00Z'));
      expect(profile.trialEndsAt).toEqual(new Date('2026-04-09T12:00:00Z'));
    });

    it('after the trial serves the standard design but keeps theirs for when they pay', () => {
      jest.useFakeTimers().setSystemTime(approvedOn);
      try {
        const profile = ProviderProfile.draft('account-1');
        profile.approvedAt = approvedOn;
        profile.startTrial();
        profile.saveDesignDraft({ template: 'minimal' });
        profile.publishDesign();
        expect(profile.effectiveDesign.template).toBe('minimal');

        jest.setSystemTime(new Date('2026-04-20T00:00:00Z'));
        expect(profile.effectiveDesign).toEqual(DEFAULT_PAGE_DESIGN);
        expect(() => profile.saveDesignDraft({ template: 'gallery' })).toThrow(ValidationError);

        profile.activateVip('monthly');
        expect(profile.effectiveDesign.template).toBe('minimal');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('page blocks', () => {
    it('keeps added blocks in order with their content', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.saveDesignDraft({
        sections: [
          { id: 'b1', type: 'hero', enabled: true, data: { title: '  Paseos con cariño ', subtitle: 'En Metepec' } },
          { id: 'about', enabled: true },
          { id: 'b2', type: 'prices', enabled: true, data: { items: [{ name: 'Paseo 30 min', detail: '', price: '$100' }, { name: '', detail: '' }] } },
        ],
      });
      const sections = profile.draftDesign.sections;
      expect(sections.slice(0, 3).map((s) => s.id)).toEqual(['b1', 'about', 'b2']);
      expect(sections[0].data?.title).toBe('Paseos con cariño');
      expect(sections[2].data?.items).toEqual([{ name: 'Paseo 30 min', detail: '', price: '$100' }]);
      // Built-in sections the client left out are still there.
      expect(new Set(sections.filter((s) => !s.data).map((s) => s.id))).toEqual(new Set(PAGE_SECTIONS));
    });

    it('reads designs saved before blocks existed', () => {
      const profile = ProviderProfile.draft('account-1');
      profile.designPublished = {
        ...DEFAULT_PAGE_DESIGN,
        sections: [{ id: 'gallery', enabled: false }],
      } as never;
      const gallery = profile.effectiveDesign.sections.find((s) => s.id === 'gallery');
      expect(gallery).toEqual({ id: 'gallery', type: 'gallery', enabled: false });
    });

    it('rejects content that is too long, a bad link or a bad date', () => {
      const profile = ProviderProfile.draft('account-1');
      const block = (type: string, data: unknown) => ({ sections: [{ id: 'x1', type, enabled: true, data }] });
      expect(() => profile.saveDesignDraft(block('hero', { title: 'a'.repeat(81) }))).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft(block('video', { url: 'javascript:alert(1)' }))).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft(block('social', { instagram: 'hola mundo' }))).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft(block('promo', { until: 'mañana' }))).toThrow(ValidationError);
      expect(() => profile.saveDesignDraft(block('promo', { title: '2x1', until: '2026-12-31' }))).not.toThrow();
    });

    it('caps the number of added blocks', () => {
      const profile = ProviderProfile.draft('account-1');
      const sections = Array.from({ length: 21 }, (_, i) => ({ id: `b${i}`, type: 'text', enabled: true, data: {} }));
      expect(() => profile.saveDesignDraft({ sections })).toThrow(ValidationError);
    });
  });
});
