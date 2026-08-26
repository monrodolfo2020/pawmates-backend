import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type {
  AuthorizePaymentRequest,
  AuthorizePaymentResponse,
  CapturePaymentRequest,
  CapturePaymentResponse,
  ChargeOrderRequest,
  ChargeOrderResponse,
  RefundOrderRequest,
  RefundOrderResponse,
} from '@pawmates/proto';
import { ulid } from 'ulid';

/**
 * Skeleton implementation of PaymentsService (payments.proto). Always
 * authorizes/captures so booking-svc's saga — including its compensation
 * path on a declined card — can be exercised end to end (Prompt 5 scope).
 * No real PSP integration, no Transaction persistence; see the Domain
 * Model doc §10 Payments section for what a full implementation needs.
 */
@Controller()
export class PaymentsGrpcController {
  @GrpcMethod('PaymentsService', 'AuthorizePayment')
  authorizePayment(_data: AuthorizePaymentRequest): AuthorizePaymentResponse {
    return { transactionId: ulid().toLowerCase(), status: 'authorized' };
  }

  @GrpcMethod('PaymentsService', 'CapturePayment')
  capturePayment(_data: CapturePaymentRequest): CapturePaymentResponse {
    return { status: 'captured' };
  }

  // PawMates Commerce (Prompt 5 follow-up) — commerce-svc charges an Order
  // in full at checkout rather than authorize-then-capture (see payments.proto).
  @GrpcMethod('PaymentsService', 'ChargeOrder')
  chargeOrder(_data: ChargeOrderRequest): ChargeOrderResponse {
    return { transactionId: ulid().toLowerCase(), status: 'captured' };
  }

  @GrpcMethod('PaymentsService', 'RefundOrder')
  refundOrder(_data: RefundOrderRequest): RefundOrderResponse {
    return { status: 'refunded' };
  }
}
