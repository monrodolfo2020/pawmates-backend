import type { BetterSqlite3ConnectionOptions } from 'typeorm/driver/better-sqlite3/BetterSqlite3ConnectionOptions';

/**
 * Turso (libSQL) connection for TypeORM — see README's Database section.
 * TypeORM has no dedicated Turso dialect, but `libsql`'s client library
 * is a near drop-in replacement for `better-sqlite3`'s API, wired in via
 * npm's package-alias syntax in package.json:
 * `"better-sqlite3": "npm:libsql@^0.x"`. Requiring 'better-sqlite3' below
 * therefore actually loads `libsql`.
 *
 * TypeORM's own BetterSqlite3Driver only forwards a fixed whitelist of
 * Options keys (readonly/fileMustExist/timeout/verbose/nativeBinding) to
 * the underlying `new Database(...)` call — `authToken` isn't one of
 * them, so it's injected here instead, inside a `driver` factory TypeORM
 * calls directly rather than relying on its own option-passing.
 *
 * No TURSO_DATABASE_URL set → a local libSQL file (SQLITE_LOCAL_PATH,
 * default ./pawmates-local.db) — the same engine, just not synced to
 * Turso, so local dev needs no Turso account at all.
 */
export function libsqlConnectionOptions(): Pick<
  BetterSqlite3ConnectionOptions,
  'type' | 'database' | 'driver'
> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LibsqlDatabase = require('better-sqlite3');
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  // A plain `function`, not an arrow — TypeORM's BetterSqlite3Driver
  // calls this as `new this.sqlite(...)`, and only a real `function` can
  // be invoked with `new` at all. Explicitly returning the constructed
  // `libsql` Database instance makes JS use *that* as the `new` result
  // instead of the (irrelevant) implicit `this` — the same trick makes
  // this work if some other TypeORM code path ever calls it bare
  // (`this.sqlite(...)`, no `new`) instead, since an explicit return
  // wins either way. `path` is ignored in favor of the closed-over
  // `tursoUrl` when one is set — see the `database` field below for why
  // the driver can't just be handed `tursoUrl` as `path` directly.
  function driver(path: string, opts: Record<string, unknown>) {
    return new LibsqlDatabase(
      tursoUrl ?? path,
      tursoUrl ? { ...opts, authToken } : opts,
    );
  }

  return {
    type: 'better-sqlite3',
    // BetterSqlite3Driver.createDatabaseConnection() always runs
    // fs.mkdir(path.dirname(this.options.database)) first (skipped only
    // for the literal string ':memory:') — reasonable for a real file
    // path, but path.dirname() on a `libsql://host` URL yields nonsense
    // like `libsql:/`, which then fails to mkdir on Vercel's read-only
    // filesystem. ':memory:' opts out of that codepath entirely; the
    // driver function above still connects to the real tursoUrl via
    // closure, ignoring this value.
    database: tursoUrl
      ? ':memory:'
      : (process.env.SQLITE_LOCAL_PATH ?? './pawmates-local.db'),
    driver,
  };
}
