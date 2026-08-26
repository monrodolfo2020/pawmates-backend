import { Injectable } from '@nestjs/common';
import type { TrustSafetyPort } from '../../domain/ports/trust-safety.port';

/**
 * MVP stand-in for the Trust & Safety Bounded Context (out of scope for
 * this consolidated deploy — see README's "What this MVP leaves out").
 * Always reports a valid, far-future verification, exactly like the old
 * trust-safety-svc gRPC stub did, so BookingProcessManager's saga still
 * exercises this check without a real Verification aggregate behind it.
 */
@Injectable()
export class FakeTrustSafetyAdapter implements TrustSafetyPort {
  checkVerificationValid(): Promise<{ valid: boolean; expiresAt: Date }> {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return Promise.resolve({ valid: true, expiresAt: oneYearFromNow });
  }
}
