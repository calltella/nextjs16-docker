import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';
// src/db/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  amount: integer('amount').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull().default('expense'),
  category: text('category').notNull(),
  date: text('date').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});