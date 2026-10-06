import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
// src/db/index.ts
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

    const client = postgres(databaseUrl, {
      prepare: false,
      ssl: process.env.DATABASE_SSL === 'true' ? 'require' : false,
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