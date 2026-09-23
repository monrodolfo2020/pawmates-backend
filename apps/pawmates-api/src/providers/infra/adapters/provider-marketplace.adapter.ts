import { Money } from '@pawmates/common';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  AvailabilityCheck,
  MarketplacePort,
} from '../../../booking/domain/ports/marketplace.port';
import {
  ProviderProfile,
  PUBLICLY_VISIBLE,
} from '../../domain/entities/provider-profile.entity';

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
    // Same bar as the public directory: a business the admin hasn't
    // approved yet can't be found there, so it can't be booked either.
    const profile = await this.profiles.findOne({
      where: { ...PUBLICLY_VISIBLE, accountId: params.providerServiceId },
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
      // PawMates charges businesses a subscription, never a cut of their
      // work (Acuerdo de prestadores, cláusula 3.3) — a booking carries
      // the business's own rate and nothing on top.
      commission: Money.zero(profile.price.currency),
      tax: Money.zero(profile.price.currency),
    };
  }
}
