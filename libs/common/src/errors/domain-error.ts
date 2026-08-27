/**
 * Base of every domain-level error. `code` and `retryable` map straight
 * onto the error envelope defined in the API Design doc (Sheet 4, §11):
 * { error: { code, message, retryable } }.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;
  abstract readonly retryable: boolean;
}

export class ValidationError extends DomainError {
  readonly code = 'validation.invalid_field';
  readonly httpStatus = 400;
  readonly retryable = false;
}

export class ResourceNotFoundError extends DomainError {
  readonly code = 'resource.not_found';
  readonly httpStatus = 404;
  readonly retryable = false;
}

export class TrustSafetyVerificationRequiredError extends DomainError {
  readonly code = 'trust_safety.verification_required';
  readonly httpStatus = 403;
  readonly retryable = false;
}

/** Policy P-14 / P-17 — no double booking. */
export class BookingProviderDoubleBookedError extends DomainError {
  readonly code = 'booking.provider_double_booked';
  readonly httpStatus = 409;
  readonly retryable = false;
}

/** Policy P-15 — no cancelling after the service has started. */
export class BookingCannotCancelInProgressError extends DomainError {
  readonly code = 'booking.cannot_cancel_in_progress';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class BookingNotEligibleForReviewError extends DomainError {
  readonly code = 'reviews.not_eligible';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class PaymentCardDeclinedError extends DomainError {
  readonly code = 'payments.card_declined';
  readonly httpStatus = 422;
  readonly retryable = true;
}

export class DependencyUnavailableError extends DomainError {
  readonly code = 'dependency.unavailable';
  readonly httpStatus = 503;
  readonly retryable = true;
}

/** Product.reserveStock — not enough stock left to fulfill the line item. */
export class InsufficientStockError extends DomainError {
  readonly code = 'commerce.insufficient_stock';
  readonly httpStatus = 409;
  readonly retryable = false;
}

/** Order.confirmDelivered — the walker's trip for this order hasn't finished yet. */
export class OrderDeliveryNotReadyError extends DomainError {
  readonly code = 'commerce.delivery_not_ready';
  readonly httpStatus = 409;
  readonly retryable = false;
}

/** RequiresUpcomingBookingPolicy — no confirmed future Booking to attach for delivery. */
export class NoUpcomingBookingError extends DomainError {
  readonly code = 'commerce.no_upcoming_booking';
  readonly httpStatus = 422;
  readonly retryable = true;
}

export class EmailAlreadyRegisteredError extends DomainError {
  readonly code = 'auth.email_already_registered';
  readonly httpStatus = 409;
  readonly retryable = false;
}

export class InvalidCredentialsError extends DomainError {
  readonly code = 'auth.invalid_credentials';
  readonly httpStatus = 401;
  readonly retryable = false;
}

/** e.g. a non-admin account calling an admin-only endpoint. */
export class RoleRequiredError extends DomainError {
  readonly code = 'auth.role_required';
  readonly httpStatus = 403;
  readonly retryable = false;
}
