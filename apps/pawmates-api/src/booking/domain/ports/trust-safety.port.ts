export const TRUST_SAFETY_PORT = Symbol('TRUST_SAFETY_PORT');

/** gRPC contract, API Design doc §08 — CheckVerificationValid. */
export interface TrustSafetyPort {
  checkVerificationValid(params: {
    accountId: string;
    requiredLevel: 'basic' | 'standard' | 'enhanced';
  }): Promise<{ valid: boolean; expiresAt: Date }>;
}
