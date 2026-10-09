import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export function getDb(): PostgresJsDatabase<typeof schema> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }

  // Workers向け: SSLは {} を渡す（rejectUnauthorized を触らない）
  const sslOption = process.env.DATABASE_SSL === 'true' ? {} : false;

  const client = postgres(databaseUrl, {
    prepare: false,   // Supabase Transaction mode 向け
    ssl: sslOption,
    max: 1,           // Workersでは1で十分
    // idle_timeout は外すか、かなり長めにする
    connect_timeout: 10,
  });

  return drizzle({ client, schema });
}

// Proxy は残しても良いが、毎回 getDb() する方が安全
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});