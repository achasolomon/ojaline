import { Module, Global } from '@nestjs/common';
import { Pool } from 'pg';
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
  ],
  exports: [Pool],
})
export class DatabaseModule {}
