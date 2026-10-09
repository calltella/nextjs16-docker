import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

let _db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (!_db) {
    const databaseUrl = process.env.DATABASE_URL;
    console.log(
      'DATABASE_URL exists:',
      !!databaseUrl
    );
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }

    // In Cloudflare Workers (workerd), passing 'require' causes postgres-js to set rejectUnauthorized = false,
    // which throws ERR_OPTION_NOT_IMPLEMENTED in workerd. Passing {} enables SSL without setting rejectUnauthorized.
    const sslOption = process.env.DATABASE_SSL === 'true' ? {} : false;

    const client = postgres(databaseUrl, {
      prepare: false,
      ssl: sslOption,
      max: 1,
      idle_timeout: 10,
      connect_timeout: 10,
    });
    _db = drizzle({ client, schema });
  }
  return _db;
}

export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
