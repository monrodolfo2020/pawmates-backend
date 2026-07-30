/**
 * Money — amount is always an integer in the currency's minor unit
 * (cents), never floating point (Domain Model, Value Objects catalog).
 * Arithmetic across different currencies throws rather than silently
 * producing a nonsensical total.
 */
export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: string,
  ) {
    if (!Number.isInteger(amount)) {
      throw new Error('Money.amount must be an integer minor-unit value');
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error(
        `Money.currency must be an ISO 4217 code, got "${currency}"`,
      );
    }
  }

  static of(amount: number, currency: string): Money {
    return new Money(amount, currency);
  }

  static zero(currency: string): Money {
    return new Money(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  multiply(factor: number): Money {
    return new Money(Math.round(this.amount * factor), this.currency);
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount > other.amount;
  }

  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Cannot operate on Money of different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }

  toJSON() {
    return { amount: this.amount, currency: this.currency };
  }
}
