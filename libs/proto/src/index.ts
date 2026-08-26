import { join } from 'path';

export * from './interfaces';

/**
 * Resolves a .proto file's path relative to the monorepo root. Services are
 * always started with the repo root as `cwd` (locally via `nest start`, in
 * CI via jest, in production via the Docker WORKDIR) so this avoids wiring
 * per-app asset-copy config in nest-cli.json for a handful of shared files.
 */
export function protoPath(fileName: string): string {
  return join(process.cwd(), 'libs/proto/src', fileName);
}

export const PROTO_PACKAGES = {
  marketplace: 'pawmates.marketplace',
  trustSafety: 'pawmates.trust_safety',
  payments: 'pawmates.payments',
  booking: 'pawmates.booking',
} as const;
