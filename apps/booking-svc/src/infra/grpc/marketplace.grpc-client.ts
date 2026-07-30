import { Money } from '@pawmates/common';
import type {
  CheckAvailabilityResponse,
  MarketplaceServiceClient,
} from '@pawmates/proto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  AvailabilityCheck,
  MarketplacePort,
} from '../../domain/ports/marketplace.port';

export const MARKETPLACE_GRPC_CLIENT = Symbol('MARKETPLACE_GRPC_CLIENT');

/**
 * Real gRPC client — the only synchronous call to marketplace-svc that
 * booking-svc makes (Architecture ADR-03). marketplace-svc itself is a
 * skeleton in this prompt: it answers with a fixed available=true stub
 * so this saga can be exercised end to end (see apps/marketplace-svc).
 */
@Injectable()
export class MarketplaceGrpcClient implements MarketplacePort, OnModuleInit {
  private service!: MarketplaceServiceClient;

  constructor(
    @Inject(MARKETPLACE_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.service =
      this.client.getService<MarketplaceServiceClient>('MarketplaceService');
  }

  async checkAvailability(params: {
    providerServiceId: string;
    scheduledAt: Date;
    durationMinutes: number;
  }): Promise<AvailabilityCheck> {
    const res = await firstValueFrom(
      this.service.checkAvailability({
        providerServiceId: params.providerServiceId,
        scheduledAt: params.scheduledAt.toISOString(),
        durationMinutes: params.durationMinutes,
      }),
    );
    return mapResponse(res);
  }
}

function mapResponse(res: CheckAvailabilityResponse): AvailabilityCheck {
  const pb = res.priceBreakdown;
  return {
    available: res.available,
    providerId: res.providerId,
    rate: Money.of(pb.rateAmount, pb.currency),
    commission: Money.of(pb.commissionAmount, pb.currency),
    tax: Money.of(pb.taxAmount, pb.currency),
  };
}
