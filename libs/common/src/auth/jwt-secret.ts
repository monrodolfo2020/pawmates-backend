/** The value docker-compose uses locally. Anyone who has read this repo
 * knows it, so a deployed server must never sign with it. */
export const DEV_JWT_SECRET = 'dev-secret-change-me';

/** Below this, a secret is guessable enough to be worth a warning. */
const MIN_SECRET_LENGTH = 32;

/** Running on a real host rather than someone's machine. Vercel and
 * Render both set these on their own. */
function isDeployed(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'production' || Boolean(env.VERCEL) || Boolean(env.RENDER);
}

/**
 * The key every session token is signed and checked with.
 *
 * Whoever knows it can mint a token for any account, admins included,
 * so a deployed server refuses to start without one of its own rather
 * than quietly falling back to the public development value. Locally
 * (and in tests) the development value is still used, so nothing has to
 * be configured to run the app on your machine.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.JWT_SECRET?.trim();
  if (secret && secret !== DEV_JWT_SECRET) {
    if (secret.length < MIN_SECRET_LENGTH) {
      console.warn(
        `JWT_SECRET has only ${secret.length} characters; use at least ${MIN_SECRET_LENGTH} (e.g. openssl rand -hex 32).`,
      );
    }
    return secret;
  }
  if (isDeployed(env)) {
    throw new Error(
      secret
        ? 'JWT_SECRET is set to the public development value. Set it to a long random string (openssl rand -hex 32) in the host\'s environment variables and redeploy.'
        : 'JWT_SECRET is not set. Set it to a long random string (openssl rand -hex 32) in the host\'s environment variables and redeploy.',
    );
  }
  return DEV_JWT_SECRET;
}
