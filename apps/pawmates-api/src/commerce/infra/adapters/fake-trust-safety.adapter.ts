import { Injectable } from '@nestjs/common';
import type { TrustSafetyPort } from '../../domain/ports/trust-safety.port';

/** MVP stand-in for Trust & Safety — see booking's identical adapter for why. */
@Injectable()
export class FakeTrustSafetyAdapter implements TrustSafetyPort {
  checkVerificationValid(): Promise<{ valid: boolean; expiresAt: Date }> {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return Promise.resolve({ valid: true, expiresAt: oneYearFromNow });
  }
}
