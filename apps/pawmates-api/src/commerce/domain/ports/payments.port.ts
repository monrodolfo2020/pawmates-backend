import { Money } from '@pawmates/common';

export const PAYMENTS_PORT = Symbol('PAYMENTS_PORT');

/**
 * gRPC contract, payments.proto — ChargeOrder / RefundOrder. Distinct from
 * booking-svc's AuthorizePayment/CapturePayment pair: an Order is charged
 * in full at checkout, not authorized-then-captured.
 */
export interface PaymentsPort {
  chargeOrder(params: {
    orderId: string;
    amount: Money;
    paymentMethodId: string;
    idempotencyKey: string;
  }): Promise<{ transactionId: string; status: 'captured' | 'failed' }>;

  refundOrder(params: {
    transactionId: string;
    amount: Money;
  }): Promise<{ status: 'refunded' | 'failed' }>;
}
