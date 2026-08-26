import { Observable } from 'rxjs';

// Hand-written mirrors of the .proto messages in this package — kept in
// sync manually since the proto set is small. If it grows, generate these
// with ts-proto instead of maintaining both by hand.

export interface PriceBreakdown {
  rateAmount: number;
  commissionAmount: number;
  taxAmount: number;
  tipEstimate: number;
  totalAmount: number;
  currency: string;
}

export interface CheckAvailabilityRequest {
  providerServiceId: string;
  scheduledAt: string;
  durationMinutes: number;
}

export interface CheckAvailabilityResponse {
  available: boolean;
  priceBreakdown: PriceBreakdown;
  providerId: string;
}

export interface MarketplaceServiceClient {
  checkAvailability(
    request: CheckAvailabilityRequest,
  ): Observable<CheckAvailabilityResponse>;
}

export interface CheckVerificationValidRequest {
  accountId: string;
  requiredLevel: 'basic' | 'standard' | 'enhanced';
}

export interface CheckVerificationValidResponse {
  valid: boolean;
  expiresAt: string;
}

export interface TrustSafetyServiceClient {
  checkVerificationValid(
    request: CheckVerificationValidRequest,
  ): Observable<CheckVerificationValidResponse>;
}

export interface AuthorizePaymentRequest {
  bookingId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface AuthorizePaymentResponse {
  transactionId: string;
  status: 'authorized' | 'failed';
}

export interface CapturePaymentRequest {
  transactionId: string;
  finalAmount: number;
}

export interface CapturePaymentResponse {
  status: 'captured' | 'failed';
}

export interface ChargeOrderRequest {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethodId: string;
  idempotencyKey: string;
}

export interface ChargeOrderResponse {
  transactionId: string;
  status: 'captured' | 'failed';
}

export interface RefundOrderRequest {
  transactionId: string;
  amount: number;
}

export interface RefundOrderResponse {
  status: 'refunded' | 'failed';
}

export interface PaymentsServiceClient {
  authorizePayment(
    request: AuthorizePaymentRequest,
  ): Observable<AuthorizePaymentResponse>;
  capturePayment(
    request: CapturePaymentRequest,
  ): Observable<CapturePaymentResponse>;
  chargeOrder(request: ChargeOrderRequest): Observable<ChargeOrderResponse>;
  refundOrder(request: RefundOrderRequest): Observable<RefundOrderResponse>;
}

export interface GetUpcomingConfirmedBookingRequest {
  ownerId: string;
  providerId: string;
}

export interface GetUpcomingConfirmedBookingResponse {
  found: boolean;
  bookingId: string;
  scheduledAt: string;
}

export interface BookingServiceClient {
  getUpcomingConfirmedBooking(
    request: GetUpcomingConfirmedBookingRequest,
  ): Observable<GetUpcomingConfirmedBookingResponse>;
}
