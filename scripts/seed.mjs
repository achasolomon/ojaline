/**
 * Seed script — populates DB with realistic data and primes Redis counters.
 *
 * Usage:  node scripts/seed.mjs
 * Requires: Docker Compose stack running (postgres on 5433, redis on 6380)
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Redis from 'ioredis';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const PG = {
  host: 'localhost',
  port: 5433,
  database: 'ojaline',
  user: 'ojaline',
  password: 'ojaline_dev_pw',
};

const REDIS_URL = 'redis://localhost:6380';

// Offer IDs and their available_qty (must match seed.sql)
const OFFERS = [
  { id: '11000000-0000-4000-8000-000000000001', qty: 500 },
  { id: '11000000-0000-4000-8000-000000000002', qty: 200 },
  { id: '11000000-0000-4000-8000-000000000003', qty: 300 },
  { id: '11000000-0000-4000-8000-000000000004', qty: 1000 },
  { id: '11000000-0000-4000-8000-000000000005', qty: 800 },
  { id: '11000000-0000-4000-8000-000000000006', qty: 150 },
  { id: '11000000-0000-4000-8000-000000000007', qty: 400 },
  { id: '11000000-0000-4000-8000-000000000008', qty: 600 },
];

async function seedPostgres() {
  console.log('🐘 Seeding PostgreSQL...');
  const sqlPath = resolve(__dirname, 'seed.sql');
  const sql = readFileSync(sqlPath, 'utf8');

  const connString = `postgresql://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${PG.database}`;
  execSync(`psql "${connString}" -f "${sqlPath}"`, {
    stdio: 'inherit',
    cwd: ROOT,
  });
  console.log('  ✅ PostgreSQL seeded');
}

async function seedRedis() {
  console.log('🔴 Seeding Redis counters...');
  const redis = new Redis(REDIS_URL);

  for (const offer of OFFERS) {
    const key = `oj:offers:${offer.id}`;
    await redis.hmset(key, { available: offer.qty, reserved: 0, soft_held: 0 });
    console.log(`  ${key} = available:${offer.qty} reserved:0 soft_held:0`);
  }

  await redis.quit();
  console.log('  ✅ Redis counters seeded');
}

async function main() {
  try {
    await seedPostgres();
    await seedRedis();
    console.log('\n🎉 Seed complete. Frontend can now display real data.');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

main();
