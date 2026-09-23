// The database driver can return bigint as a string (values may exceed the
// safe integer range for other columns); minor-currency-unit amounts
// never will in practice, so we transform back to number for Money.
// `null` has to round-trip: price_amount is optional here (only walkers
// are required to have a rate — see ProviderProfile's publish rule), and
// parseInt(null) is NaN, which Money.of then rejects as a non-integer.
export const bigintTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseInt(value, 10)),
};
