// Postgres returns bigint as string by default (values may exceed the
// safe integer range for other columns); minor-currency-unit amounts
// never will in practice, so we transform back to number for Money.
// (Same transformer as Commerce's own — duplicated rather than shared
// across bounded contexts, matching this codebase's convention of each
// module owning its own small infra pieces; see e.g. each of Booking's
// and Commerce's own FakeTrustSafetyAdapter.)
export const bigintTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseInt(value, 10),
};
