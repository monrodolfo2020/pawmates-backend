import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  CheckAvailabilityRequest,
  CheckAvailabilityResponse,
} from '@pawmates/proto';

// A fixed demo ServiceProvider account — real marketplace-svc resolves this
// from provider_service_id via the marketplace.provider_services table
// (Data Model doc §07); this skeleton has no persistence yet.
const DEMO_PROVIDER_ID = '00000000-0000-0000-0000-0000000000aa';

/**
 * Skeleton implementation of MarketplaceService (marketplace.proto).
 * Always reports availability with a flat rate card so booking-svc's saga
 * (Prompt 5 scope: booking-svc complete, every other context scaffolded)
 * can be exercised end to end. Real availability/pricing logic — the
 * ServiceProvider calendar, RateCard, capacity checks — is out of scope
 * here; see the Domain Model doc §10 Marketplace section for what a full
 * implementation needs to check.
 */
@Controller()
export class MarketplaceGrpcController {
  @GrpcMethod('MarketplaceService', 'CheckAvailability')
  checkAvailability(
    _data: CheckAvailabilityRequest,
  ): CheckAvailabilityResponse {
    return {
      available: true,
      providerId: DEMO_PROVIDER_ID,
      priceBreakdown: {
        rateAmount: 5000,
        commissionAmount: 750,
        taxAmount: 0,
        tipEstimate: 0,
        totalAmount: 5750,
        currency: 'USD',
      },
    };
  }
}
