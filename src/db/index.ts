import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set');
}

// port 6543 = Supavisor Transaction mode。prepared statement非対応なので必須
const client = postgres(databaseUrl, { prepare: false });

export const db = drizzle({ client, schema });