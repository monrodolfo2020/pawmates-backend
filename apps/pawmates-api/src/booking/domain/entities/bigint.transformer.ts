// Amounts are stored as bigint (minor currency units), and a database
// driver may hand bigint back as a string; parseInt makes it a number for
// Money either way. Amounts never approach the unsafe-integer range.
export const bigintTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseInt(value, 10),
};
