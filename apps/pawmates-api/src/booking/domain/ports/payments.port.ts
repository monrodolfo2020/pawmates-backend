import { Money } from '@pawmates/common';

export const PAYMENTS_PORT = Symbol('PAYMENTS_PORT');

/** gRPC contract, API Design doc §08 — AuthorizePayment / CapturePayment. */
export interface PaymentsPort {
  authorizePayment(params: {
    bookingId: string;
    amount: Money;
    paymentMethodId: string;
    idempotencyKey: string;
  }): Promise<{ transactionId: string; status: 'authorized' | 'failed' }>;

  capturePayment(params: {
    transactionId: string;
    finalAmount: Money;
  }): Promise<{ status: 'captured' | 'failed' }>;
}
