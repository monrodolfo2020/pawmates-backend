import type { BillingPeriod } from '../value-objects/billing';

export const BILLING_PORT = Symbol('BILLING_PORT');

export interface CheckoutRequest {
  accountId: string;
  businessName: string;
  period: BillingPeriod;
  amount: number;
  currency: string;
  /** Where the gateway should send the business back once it's done. */
  returnUrl: string;
}

export interface CheckoutSession {
  /** The gateway's id for this payment. Stored on the activation row and
   * matched against the webhook later, so it has to be the same value
   * the gateway will report back. */
  reference: string;
  /** Where to send the business to pay. */
  url: string;
}

/**
 * The seam a real payment gateway plugs into. Deliberately small: start
 * a checkout, and turn whatever the gateway posts back into "this
 * reference is paid". Everything else about a plan — how long it lasts,
 * whether renewing stacks, what a lapsed plan does to the page — is
 * domain logic in ProviderProfile and doesn't belong to any gateway.
 *
 * Nothing charges real money today (see SimulatedBillingAdapter). When
 * Stripe or MercadoPago is wired up, it implements this interface and
 * BillingController stops needing to change: createCheckout maps to
 * their session/preference API, and verifyCallback to their signed
 * webhook.
 */
export interface BillingPort {
  /** False when no gateway is configured — the API then refuses to start
   * a checkout instead of sending the business to a dead end. */
  readonly online: boolean;

  /** A name for the UI ('simulation', 'stripe', …). */
  readonly name: string;

  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;

  /**
   * Turns a callback from the gateway into the reference it settles.
   * Returns null when the payload isn't a completed payment (or fails
   * verification), which the controller treats as "nothing to activate"
   * rather than an error, because gateways send many event types to the
   * same endpoint.
   */
  verifyCallback(payload: unknown, headers: Record<string, string>): Promise<string | null>;
}
