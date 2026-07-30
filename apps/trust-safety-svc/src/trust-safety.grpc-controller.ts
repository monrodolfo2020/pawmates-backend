import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  CheckVerificationValidRequest,
  CheckVerificationValidResponse,
} from '@pawmates/proto';

/**
 * Skeleton implementation of TrustSafetyService (trust-safety.proto).
 * Always reports a valid, far-future verification so booking-svc's saga
 * can be exercised end to end (Prompt 5 scope). Real KYC/background-check
 * expiry tracking — the Verification aggregate in the Domain Model doc
 * §10 — is out of scope here.
 */
@Controller()
export class TrustSafetyGrpcController {
  @GrpcMethod('TrustSafetyService', 'CheckVerificationValid')
  checkVerificationValid(
    _data: CheckVerificationValidRequest,
  ): CheckVerificationValidResponse {
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    return { valid: true, expiresAt: oneYearFromNow.toISOString() };
  }
}
