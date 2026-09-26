import { Money } from '@pawmates/common';

export interface AvailabilityCheck {
  available: boolean;
  providerId: string;
  rate: Money;
  commission: Money;
  tax: Money;
  /** Set when the booking asked for one of the business's services. */
  service?: { id: string; name: string; durationMinutes: number | null };
}

export const MARKETPLACE_PORT = Symbol('MARKETPLACE_PORT');

/** gRPC contract, API Design doc §08 — CheckAvailability. */
export interface MarketplacePort {
  checkAvailability(params: {
    providerServiceId: string;
    scheduledAt: Date;
    durationMinutes: number;
    serviceId?: string;
  }): Promise<AvailabilityCheck>;
}
