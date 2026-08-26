import { Injectable } from '@nestjs/common';
import type {
  AvailabilityCheck,
  MarketplacePort,
} from '../../domain/ports/marketplace.port';
import { Money } from '@pawmates/common';

// A fixed demo ServiceProvider account — real marketplace-svc would resolve
// this from provider_service_id via a ServiceProvider/RateCard lookup; out
// of scope for this MVP (see README).
const DEMO_PROVIDER_ID = '00000000-0000-0000-0000-0000000000aa';

/**
 * MVP stand-in for the Marketplace Bounded Context. Always reports
 * availability with a flat rate card, exactly like the old marketplace-svc
 * gRPC stub did, so BookingProcessManager's saga still runs end to end.
 */
@Injectable()
export class FakeMarketplaceAdapter implements MarketplacePort {
  checkAvailability(): Promise<AvailabilityCheck> {
    return Promise.resolve({
      available: true,
      providerId: DEMO_PROVIDER_ID,
      rate: Money.of(5000, 'USD'),
      commission: Money.of(750, 'USD'),
      tax: Money.of(0, 'USD'),
    });
  }
}
