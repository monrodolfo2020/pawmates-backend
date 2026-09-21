// Postgres returns bigint as string by default (values may exceed the
// safe integer range for other columns); minor-currency-unit amounts
// never will in practice, so we transform back to number for Money.
// (Same transformer as Commerce's own — duplicated rather than shared
// across bounded contexts, matching this codebase's convention of each
// module owning its own small infra pieces; see e.g. each of Booking's
// and Commerce's own FakeTrustSafetyAdapter.)
// `null` has to round-trip: price_amount is optional here (only walkers
// are required to have a rate — see ProviderProfile's publish rule), and
// parseInt(null) is NaN, which Money.of then rejects as a non-integer.
export const bigintTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseInt(value, 10)),
};
