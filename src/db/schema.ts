import { pgTable, uuid, text, timestamp, boolean, integer, bigint, date } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// src/db/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cardTypes = pgTable('card_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').default(sql`auth.uid()`),
  name: text('name').notNull(),
  paymentMethod: text('payment_method'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  amount: integer('amount').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull().default('expense'),
  category: text('category').notNull(),
  date: text('date').notNull(),
  paymentMethod: text('payment_method'),
  parentCategory: text('parent_category'),
  subCategory: text('sub_category'),
  location: text('location'),
  note: text('note'),
  remarks: text('remarks'),
  tags: text('tags'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionsWork = pgTable('transactions_work', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  date: date('date').notNull(),
  type: text('type').notNull(),
  paymentMethod: text('payment_method'),
  parentCategory: text('parent_category'),
  childCategory: text('child_category'),
  amount: integer('amount'),
  location: text('location'),
  memo: text('memo'),
  note: text('note'),
  tag: text('tag'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});