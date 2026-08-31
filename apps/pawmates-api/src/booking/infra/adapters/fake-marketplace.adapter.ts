import { Injectable } from '@nestjs/common';
import type {
  AvailabilityCheck,
  MarketplacePort,
} from '../../domain/ports/marketplace.port';
import { Money } from '@pawmates/common';

/**
 * MVP stand-in for the Marketplace Bounded Context. Always reports
 * availability with a flat rate card, exactly like the old marketplace-svc
 * gRPC stub did, so BookingProcessManager's saga still runs end to end.
 *
 * Real marketplace-svc would resolve providerServiceId to a ServiceProvider
 * account via a ServiceProvider/RateCard lookup (out of scope for this MVP,
 * see README) — there being no real ServiceProvider/RateCard records to
 * look up. Until that exists, `providerServiceId` *is* treated as the
 * provider's own account id directly: it used to be discarded in favor of
 * one hardcoded demo id, which meant every booking — for whichever walker
 * the owner actually picked — collided on that same provider's schedule,
 * with "ese paseador ya tiene su horario ocupado" on effectively the very
 * first double-booked slot, for every walker. Each distinct
 * providerServiceId a client sends is now a genuinely distinct provider.
 */
@Injectable()
export class FakeMarketplaceAdapter implements MarketplacePort {
  checkAvailability(params: {
    providerServiceId: string;
  }): Promise<AvailabilityCheck> {
    return Promise.resolve({
      available: true,
      providerId: params.providerServiceId,
      rate: Money.of(5000, 'USD'),
      commission: Money.of(750, 'USD'),
      tax: Money.of(0, 'USD'),
    });
  }
}
