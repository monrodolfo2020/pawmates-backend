import { Global, Module } from '@nestjs/common';
import { RateLimiter } from './rate-limiter';

/** Global: auth, the address search and anything later all share one
 * limiter over one table. */
@Global()
@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class RateLimitModule {}
