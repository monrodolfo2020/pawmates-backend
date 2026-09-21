import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  BillingPort,
  CheckoutRequest,
  CheckoutSession,
} from '../../domain/ports/billing.port';

/**
 * Stands in for a payment gateway until there is one. It charges
 * nothing: `createCheckout` hands back a link to a page inside this same
 * app that just says "confirm", and confirming activates VIP for free.
 *
 * That makes it a way to hand out free VIP, so it is off unless
 * BILLING_PROVIDER=simulation is set explicitly. With the variable
 * unset — which is how production runs — `online` is false, the API
 * refuses to open a checkout at all, and the only ways onto VIP are an
 * activation code or the admin panel. Both of those involve a human who
 * already got paid.
 */
@Injectable()
export class SimulatedBillingAdapter implements BillingPort {
  readonly name = 'simulation';

  get online(): boolean {
    return process.env.BILLING_PROVIDER === 'simulation';
  }

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    const reference = `sim_${ulid().toLowerCase()}`;
    const url = `${request.returnUrl}?ref=${encodeURIComponent(reference)}&sim=1`;
    return Promise.resolve({ reference, url });
  }

  /** A real adapter verifies a signature here. This one trusts the
   * reference it's handed, which is exactly why `online` gates it. */
  verifyCallback(payload: unknown): Promise<string | null> {
    const reference = (payload as { reference?: unknown } | null)?.reference;
    return Promise.resolve(typeof reference === 'string' ? reference : null);
  }
}
