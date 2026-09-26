import { Money, ValidationError } from '@pawmates/common';
import type { Repository } from 'typeorm';
import { ProviderProfile } from '../../domain/entities/provider-profile.entity';
import { ProviderMarketplaceAdapter } from './provider-marketplace.adapter';

function walker(): ProviderProfile {
  const profile = ProviderProfile.draft('walker-1');
  profile.update({
    businessName: 'Paseos Lucía',
    bio: 'Paseadora.',
    price: Money.of(15000, 'MXN'),
    services: [
      {
        id: 'svc0001',
        name: 'Paseo grupal',
        detail: '',
        price: 25000,
        durationMinutes: 90,
      },
      {
        id: 'svc0002',
        name: 'Paseo corto',
        detail: '',
        price: null,
        durationMinutes: 30,
      },
    ],
  });
  return profile;
}

describe('ProviderMarketplaceAdapter', () => {
  const adapter = (profile: ProviderProfile | null) =>
    new ProviderMarketplaceAdapter({
      findOne: jest.fn().mockResolvedValue(profile),
    } as unknown as Repository<ProviderProfile>);

  it('only looks up approved, published profiles', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const repo = { findOne } as unknown as Repository<ProviderProfile>;
    await new ProviderMarketplaceAdapter(repo).checkAvailability({
      providerServiceId: 'p',
    });
    const [[{ where }]] = findOne.mock.calls as [
      [{ where: Record<string, unknown> }],
    ];
    expect(where.isPublished).toBe(true);
    expect(where.approvedAt).toBeDefined();
  });

  it('resolves the base rate, with no commission on top', async () => {
    const result = await adapter(walker()).checkAvailability({
      providerServiceId: 'walker-1',
    });
    expect(result.available).toBe(true);
    expect(result.providerId).toBe('walker-1');
    expect(result.rate.equals(Money.of(15000, 'MXN'))).toBe(true);
    expect(result.commission.equals(Money.zero('MXN'))).toBe(true);
  });

  it('prices a booking at the chosen service', async () => {
    const result = await adapter(walker()).checkAvailability({
      providerServiceId: 'walker-1',
      serviceId: 'svc0001',
    });
    expect(result.rate.amount).toBe(25000);
    expect(result.service).toEqual({
      id: 'svc0001',
      name: 'Paseo grupal',
      durationMinutes: 90,
    });
  });

  it('falls back to the base rate for a service without a price', async () => {
    const result = await adapter(walker()).checkAvailability({
      providerServiceId: 'walker-1',
      serviceId: 'svc0002',
    });
    expect(result.rate.amount).toBe(15000);
    expect(result.service?.name).toBe('Paseo corto');
  });

  it('uses the base rate when no service is chosen', async () => {
    const result = await adapter(walker()).checkAvailability({
      providerServiceId: 'walker-1',
    });
    expect(result.rate.amount).toBe(15000);
    expect(result.service).toBeUndefined();
  });

  it('refuses a service the business no longer has', async () => {
    await expect(
      adapter(walker()).checkAvailability({
        providerServiceId: 'walker-1',
        serviceId: 'gone0001',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('is unavailable for a business that is not public', async () => {
    const result = await adapter(null).checkAvailability({
      providerServiceId: 'walker-1',
    });
    expect(result.available).toBe(false);
  });
});
