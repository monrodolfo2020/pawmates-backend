const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface RateLimitRule {
  /** Prefix of the counter's key; must be unique per rule. */
  name: string;
  /** How many are allowed within one window. */
  max: number;
  windowMs: number;
  /** What the person is told when they hit it; "{minutes}" is filled in. */
  message: string;
}

/**
 * Every limit in the app, in one place so they can be tuned together.
 *
 * Windows are fixed: they start at the first counted event and the count
 * starts over once the window has passed.
 */
export const RATE_LIMITS = {
  /** Wrong passwords for one email. A correct login clears it. */
  loginPerAccount: {
    name: 'login-account',
    max: 5,
    windowMs: 15 * MINUTE,
    message:
      'Demasiados intentos con esta cuenta. Espera {minutes} o restablece tu contraseña con "¿Olvidaste tu contraseña?".',
  },
  /** Wrong passwords from one connection, across any accounts — someone
   * trying one password against many emails. */
  loginPerIp: {
    name: 'login-ip',
    max: 20,
    windowMs: 15 * MINUTE,
    message:
      'Demasiados intentos fallidos desde esta conexión. Espera {minutes}.',
  },
  /** Accounts created from one connection. */
  signupPerIp: {
    name: 'signup-ip',
    max: 5,
    windowMs: HOUR,
    message:
      'Se crearon demasiadas cuentas desde esta conexión. Intenta de nuevo en {minutes}.',
  },
  /** Emails with a code or a reset link, per address: protects a
   * person's inbox and the email quota. */
  emailPerAddress: {
    name: 'email-address',
    max: 3,
    windowMs: HOUR,
    message:
      'Ya te enviamos varios correos. Revisa tu bandeja (y spam) o intenta de nuevo en {minutes}.',
  },
  emailPerIp: {
    name: 'email-ip',
    max: 10,
    windowMs: HOUR,
    message:
      'Se pidieron demasiados correos desde esta conexión. Intenta de nuevo en {minutes}.',
  },
  /** Wrong 6-digit email codes per account. The code itself expires in
   * 15 minutes, so reaching this is effectively the end of that code. */
  verifyCodePerAccount: {
    name: 'verify-code',
    max: 5,
    windowMs: 15 * MINUTE,
    message:
      'Demasiados códigos incorrectos. Pide un código nuevo en {minutes}.',
  },
  /** Address lookups — Nominatim, the free service behind them, asks for
   * no more than about one request per second. */
  geoPerIp: {
    name: 'geo-ip',
    max: 30,
    windowMs: MINUTE,
    message: 'Demasiadas búsquedas seguidas. Espera {minutes}.',
  },
} satisfies Record<string, RateLimitRule>;
