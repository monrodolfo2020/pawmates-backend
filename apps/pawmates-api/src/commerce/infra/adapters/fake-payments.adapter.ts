import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { PaymentsPort } from '../../domain/ports/payments.port';

/**
 * MVP stand-in for Payments' ChargeOrder/RefundOrder pair. Always
 * succeeds, exactly like the old payments-svc gRPC stub did.
 */
@Injectable()
export class FakeCommercePaymentsAdapter implements PaymentsPort {
  chargeOrder(): Promise<{
    transactionId: string;
    status: 'captured' | 'failed';
  }> {
    return Promise.resolve({
      transactionId: ulid().toLowerCase(),
      status: 'captured',
    });
  }

  refundOrder(): Promise<{ status: 'refunded' | 'failed' }> {
    return Promise.resolve({ status: 'refunded' });
  }
}
