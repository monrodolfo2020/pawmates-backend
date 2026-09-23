import { Money } from '@pawmates/common';
import { ProviderProfile } from '../../domain/entities/provider-profile.entity';
import { ProviderMarketplaceAdapter } from './provider-marketplace.adapter';

function fakeRepo(profile: ProviderProfile | null) {
  return { findOne: jest.fn().mockResolvedValue(profile) } as any;
}

describe('ProviderMarketplaceAdapter', () => {
  it('reports unavailable when no published profile exists for the id', async () => {
    const adapter = new ProviderMarketplaceAdapter(fakeRepo(null));
    const result = await adapter.checkAvailability({
      providerServiceId: 'unknown',
      scheduledAt: new Date(),
      durationMinutes: 30,
    } as any);
    expect(result.available).toBe(false);
  });

  it('only looks up approved, published profiles', async () => {
    const repo = fakeRepo(null);
    const adapter = new ProviderMarketplaceAdapter(repo);
    await adapter.checkAvailability({ providerServiceId: 'p' } as any);
    const where = repo.findOne.mock.calls[0][0].where;
    expect(where.isPublished).toBe(true);
    expect(where.approvedAt).toBeDefined();
  });

  it('resolves the rate from the published profile, with no commission on top', async () => {
    const profile = ProviderProfile.draft('provider-1');
    profile.update({ bio: 'Bio', price: Money.of(85000, 'MXN') });
    const adapter = new ProviderMarketplaceAdapter(fakeRepo(profile));

    const result = await adapter.checkAvailability({
      providerServiceId: 'provider-1',
      scheduledAt: new Date(),
      durationMinutes: 30,
    } as any);

    expect(result.available).toBe(true);
    expect(result.providerId).toBe('provider-1');
    expect(result.rate.equals(Money.of(85000, 'MXN'))).toBe(true);
    expect(result.commission.equals(Money.zero('MXN'))).toBe(true);
  });
});
