/**
 * How JwtAuthGuard asks whether the account behind a token may still use
 * the app. A port rather than a direct lookup because this library has
 * no business knowing about the Account entity; the identity module
 * provides the implementation.
 */
export const ACCOUNT_STATUS = Symbol('ACCOUNT_STATUS');

export interface AccountStanding {
  /** False for a suspended account and for one that no longer exists —
   * a deleted account's still-valid token must stop working too. */
  active: boolean;
  /** The account's roles as stored now, which is what permissions go by
   * — not whatever roles were written into the token when it was issued. */
  roles: string[];
}

export interface AccountStatusPort {
  standing(accountId: string): Promise<AccountStanding>;
}
