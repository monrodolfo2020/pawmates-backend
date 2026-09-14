import { Money } from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AvailabilityCheck,
  MarketplacePort,
} from '../../../booking/domain/ports/marketplace.port';
import { ProviderProfile } from '../../domain/entities/provider-profile.entity';

const COMMISSION_RATE = 0.15; // matches the flat 15% the old fake adapter used

/**
 * The real MarketplacePort implementation (see ProviderProfile's
 * comment) — resolves a booking's `providerServiceId` against a real,
 * published ProviderProfile instead of trusting any id a client sends,
 * the way the fake in-process stand-in it replaces always did. An owner
 * can no longer book a made-up/unpublished provider id;
 * BookingProcessManager already turns `available: false` into a clean
 * ValidationError, so this needs no special-casing there.
 *
 * Does not check real-time schedule availability (`scheduledAt`/
 * `durationMinutes` are unused, same as the adapter this replaces) —
 * that's still NoDoubleBookingPolicy's job against Booking's own data,
 * per BookingProcessManager's comment on that step.
 */
@Injectable()
export class ProviderMarketplaceAdapter implements MarketplacePort {
  constructor(
    @InjectRepository(ProviderProfile)
    private readonly profiles: Repository<ProviderProfile>,
  ) {}

  async checkAvailability(params: {
    providerServiceId: string;
  }): Promise<AvailabilityCheck> {
    const profile = await this.profiles.findOne({
      where: { accountId: params.providerServiceId, isPublished: true },
    });
    if (!profile || !profile.price) {
      return {
        available: false,
        providerId: params.providerServiceId,
        rate: Money.zero('MXN'),
        commission: Money.zero('MXN'),
        tax: Money.zero('MXN'),
      };
    }
    return {
      available: true,
      providerId: profile.accountId,
      rate: profile.price,
      commission: profile.price.multiply(COMMISSION_RATE),
      tax: Money.zero(profile.price.currency),
    };
  }
}
