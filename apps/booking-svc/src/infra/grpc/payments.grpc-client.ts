import { Money } from '@pawmates/common';
import type { PaymentsServiceClient } from '@pawmates/proto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { PaymentsPort } from '../../domain/ports/payments.port';

export const PAYMENTS_GRPC_CLIENT = Symbol('PAYMENTS_GRPC_CLIENT');

@Injectable()
export class PaymentsGrpcClient implements PaymentsPort, OnModuleInit {
  private service!: PaymentsServiceClient;

  constructor(
    @Inject(PAYMENTS_GRPC_CLIENT) private readonly client: ClientGrpc,
  ) {}

  onModuleInit() {
    this.service =
      this.client.getService<PaymentsServiceClient>('PaymentsService');
  }

  async authorizePayment(params: {
    bookingId: string;
    amount: Money;
    paymentMethodId: string;
    idempotencyKey: string;
  }): Promise<{ transactionId: string; status: 'authorized' | 'failed' }> {
    const res = await firstValueFrom(
      this.service.authorizePayment({
        bookingId: params.bookingId,
        amount: params.amount.amount,
        currency: params.amount.currency,
        paymentMethodId: params.paymentMethodId,
        idempotencyKey: params.idempotencyKey,
      }),
    );
    return { transactionId: res.transactionId, status: res.status };
  }

  async capturePayment(params: {
    transactionId: string;
    finalAmount: Money;
  }): Promise<{ status: 'captured' | 'failed' }> {
    const res = await firstValueFrom(
      this.service.capturePayment({
        transactionId: params.transactionId,
        finalAmount: params.finalAmount.amount,
      }),
    );
    return { status: res.status };
  }
}
