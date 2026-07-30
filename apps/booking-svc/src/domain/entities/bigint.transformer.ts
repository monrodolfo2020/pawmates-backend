// Postgres returns bigint as string by default (values may exceed the
// safe integer range for other columns); minor-currency-unit amounts
// never will in practice, so we transform back to number for Money.
export const bigintTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseInt(value, 10),
};
