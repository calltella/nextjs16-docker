import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';
// /app/drizzle.config.ts
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});