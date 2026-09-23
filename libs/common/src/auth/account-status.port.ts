/**
 * How JwtAuthGuard asks whether the account behind a token may still use
 * the app. A port rather than a direct lookup because this library has
 * no business knowing about the Account entity; the identity module
 * provides the implementation.
 */
export const ACCOUNT_STATUS = Symbol('ACCOUNT_STATUS');

export interface AccountStatusPort {
  /** False for a suspended account and for one that no longer exists —
   * a deleted account's still-valid token must stop working too. */
  isActive(accountId: string): Promise<boolean>;
}
