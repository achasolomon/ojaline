import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { loadConfig } from '@ojaline/config';

@Global()
@Module({
  providers: [
    {
      provide: Pool,
      useFactory: () => {
        const c = loadConfig();
        return new Pool({
          host: c.DB_HOST,
          port: c.DB_PORT,
          database: c.DB_NAME,
          user: c.DB_USER,
          password: c.DB_PASSWORD,
        });
      },
    },
    {
      provide: Redis,
      useFactory: () => {
        const c = loadConfig();
        return new Redis(c.REDIS_URL);
      },
    },
  ],
  exports: [Pool, Redis],
})
export class DatabaseModule {}
