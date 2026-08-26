import { REDIS_CLIENT } from '@pawmates/common';
import type { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const RedisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: () =>
    new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
};

export { REDIS_CLIENT };
