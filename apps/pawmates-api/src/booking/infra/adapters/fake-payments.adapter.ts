import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type { PaymentsPort } from '../../domain/ports/payments.port';

/**
 * MVP stand-in for the Payments Bounded Context. Always authorizes/captures,
 * exactly like the old payments-svc gRPC stub did, so
 * BookingProcessManager's saga — including its compensation path on a
 * declined card — can still be exercised (a real PSP integration is out of
 * scope for this MVP, see README).
 */
@Injectable()
export class FakeBookingPaymentsAdapter implements PaymentsPort {
  authorizePayment(): Promise<{
    transactionId: string;
    status: 'authorized' | 'failed';
  }> {
    return Promise.resolve({
      transactionId: ulid().toLowerCase(),
      status: 'authorized',
    });
  }

  capturePayment(): Promise<{ status: 'captured' | 'failed' }> {
    return Promise.resolve({ status: 'captured' });
  }
}
