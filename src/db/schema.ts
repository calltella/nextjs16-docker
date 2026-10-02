import { pgTable, uuid, text, timestamp, boolean, integer, bigint, date, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// src/db/schema.ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  displayName: text('display_name').notNull(),
  email: text('email').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactionTypes = pgTable('transaction_types', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentMethods = pgTable('payment_methods', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull().unique(),
  type: text('type').notNull().default('other'), // 'credit_card', 'bank_account', 'cash', 'other'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const parentCategories = pgTable('parent_categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const childCategories = pgTable('child_categories', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  parentCategoryId: bigint('parent_category_id', { mode: 'number' }).notNull().references(() => parentCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique('child_cat_parent_name_unique').on(t.parentCategoryId, t.name),
]);

export const transactions = pgTable('transactions', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  date: date('date').notNull(),
  typeId: bigint('type_id', { mode: 'number' }).references(() => transactionTypes.id),
  paymentMethodId: bigint('payment_method_id', { mode: 'number' }).references(() => paymentMethods.id),
  parentCategoryId: bigint('parent_category_id', { mode: 'number' }).references(() => parentCategories.id),
  childCategoryId: bigint('child_category_id', { mode: 'number' }).references(() => childCategories.id),
  amount: integer('amount'),
  location: text('location'),
  memo: text('memo'),
  note: text('note'),
  tag: text('tag'),
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

export const cardSettings = pgTable('card_settings', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  paymentMethodId: bigint('payment_method_id', { mode: 'number' }).references(() => paymentMethods.id, { onDelete: 'cascade' }),
  cardName: text('card_name').notNull().unique(),
  isCreditCard: boolean('is_credit_card').notNull().default(true),
  closingDay: integer('closing_day').notNull().default(15),
  paymentMonthOffset: integer('payment_month_offset').notNull().default(1),
  paymentDay: integer('payment_day').notNull().default(10),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankAccounts = pgTable('bank_accounts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  paymentMethodId: bigint('payment_method_id', { mode: 'number' }).references(() => paymentMethods.id, { onDelete: 'set null' }),
  accountName: text('account_name').notNull(),
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bankBalances = pgTable('bank_balances', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedByDefaultAsIdentity(),
  userId: uuid('user_id').notNull().default(sql`auth.uid()`),
  bankAccountId: bigint('bank_account_id', { mode: 'number' }).notNull().references(() => bankAccounts.id, { onDelete: 'cascade' }),
  recordDate: date('record_date').notNull(),
  balance: integer('balance').notNull(),
  memo: text('memo'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
