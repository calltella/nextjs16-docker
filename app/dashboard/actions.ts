'use server';

import { db } from '@/src/db';
import {
  transactions,
  transactionsWork,
  cardSettings,
  transactionTypes,
  paymentMethods,
  parentCategories,
  childCategories,
  bankAccounts,
  bankBalances,
} from '@/src/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { parseHouseholdCsv } from '@/lib/csv';
import { createClient } from '@/lib/supabase/server';
import { normalizeName } from '@/lib/string-utils';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/src/db/schema';

// Helper to safely get user ID without throwing if Supabase env is unconfigured
async function getSafeUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  } catch {
    return null;
  }
}

// Automatically classify payment method type by name if not explicitly passed
function inferPaymentMethodType(name?: string | null, explicitType?: string | null): string {
  const normalized = normalizeName(name);
  if (explicitType && ['credit_card', 'bank_account', 'cash', 'other'].includes(explicitType)) {
    return explicitType;
  }
  if (!normalized) return 'other';
  const lower = normalized.toLowerCase();
  if (normalized.includes('現金') || lower.includes('cash')) {
    return 'cash';
  }
  if (
    normalized.includes('銀行') ||
    normalized.includes('口座') ||
    normalized.includes('預金') ||
    lower.includes('bank')
  ) {
    return 'bank_account';
  }
  if (
    normalized.includes('カード') ||
    normalized.includes('クレカ') ||
    lower.includes('card') ||
    lower.includes('visa') ||
    lower.includes('master') ||
    lower.includes('jcb')
  ) {
    return 'credit_card';
  }
  return 'other';
}

// Helper to ensure transactions_work table exists (No DDL executed, tables pre-created)
export async function ensureTransactionsWorkTableExists() {
  // No-op: Database schema is pre-managed and created in advance.
}

// Data normalization process for existing records
export async function initializeAndMigrateDatabase() {
  try {
    // 1. Clean up payment_methods whitespace & deduplicate entries
    const pMethods = await db.select().from(paymentMethods);
    const pmSeen = new Map<string, number>();
    for (const pm of pMethods) {
      const normalizedName = normalizeName(pm.name);
      const inferred = inferPaymentMethodType(normalizedName, pm.type);

      if (pmSeen.has(normalizedName)) {
        // Re-link transactions pointing to duplicate pm to original pm
        const keepId = pmSeen.get(normalizedName)!;
        await db.update(transactions).set({ paymentMethodId: keepId }).where(eq(transactions.paymentMethodId, pm.id));
        await db.update(bankAccounts).set({ paymentMethodId: keepId }).where(eq(bankAccounts.paymentMethodId, pm.id));
        await db.update(cardSettings).set({ paymentMethodId: keepId }).where(eq(cardSettings.paymentMethodId, pm.id));
        await db.delete(paymentMethods).where(eq(paymentMethods.id, pm.id));
      } else {
        pmSeen.set(normalizedName, pm.id);
        await db.update(paymentMethods).set({ name: normalizedName, type: inferred }).where(eq(paymentMethods.id, pm.id));
      }
    }

    // Clean up bank_accounts whitespace & deduplicate
    const bAccs = await db.select().from(bankAccounts);
    const baSeen = new Map<string, number>();
    for (const ba of bAccs) {
      const normalizedAcc = normalizeName(ba.accountName);
      if (baSeen.has(normalizedAcc)) {
        const keepId = baSeen.get(normalizedAcc)!;
        await db.update(bankBalances).set({ bankAccountId: keepId }).where(eq(bankBalances.bankAccountId, ba.id));
        await db.delete(bankAccounts).where(eq(bankAccounts.id, ba.id));
      } else {
        baSeen.set(normalizedAcc, ba.id);
        await db.update(bankAccounts).set({ accountName: normalizedAcc }).where(eq(bankAccounts.id, ba.id));
      }
    }

    // 6. Migrate / save data from transactions_work to normalized transactions
    const saveRes = await saveWorkToNormalizedTransactions();

    revalidatePath('/dashboard');
    revalidatePath('/import');
    revalidatePath('/cards');
    revalidatePath('/accounts');

    return {
      success: true,
      count: saveRes.count || 0,
      error: null,
    };
  } catch (error: unknown) {
    console.error('App-side database initialization and data migration failed:', error);
    const message = error instanceof Error ? error.message : 'アプリ側でのテーブル作成・正規化処理に失敗しました';
    return { success: false, count: 0, error: message };
  }
}

// Helper functions for normalized lookup records
async function getOrCreateTypeId(name?: string | null): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select().from(transactionTypes).where(eq(transactionTypes.name, trimmed));
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(transactionTypes).values({ name: trimmed }).returning();
  return inserted[0].id;
}

async function getOrCreatePaymentMethodId(name?: string | null, explicitType?: string | null): Promise<number | null> {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const pmType = inferPaymentMethodType(normalized, explicitType);

  const allPm = await db.select().from(paymentMethods);
  const existing = allPm.find((p) => normalizeName(p.name) === normalized);

  if (existing) {
    if (explicitType && existing.type === 'other') {
      await db.update(paymentMethods).set({ type: explicitType }).where(eq(paymentMethods.id, existing.id));
    }
    return existing.id;
  }

  const inserted = await db.insert(paymentMethods).values({ name: normalized, type: pmType }).returning();
  return inserted[0].id;
}

async function getOrCreateParentCategoryId(name?: string | null): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select().from(parentCategories).where(eq(parentCategories.name, trimmed));
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(parentCategories).values({ name: trimmed }).returning();
  return inserted[0].id;
}

async function getOrCreateChildCategoryId(name?: string | null, parentCategoryId?: number | null): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  if (parentCategoryId) {
    const existing = await db
      .select()
      .from(childCategories)
      .where(and(eq(childCategories.name, trimmed), eq(childCategories.parentCategoryId, parentCategoryId)));
    if (existing.length > 0) return existing[0].id;
  } else {
    const existing = await db.select().from(childCategories).where(eq(childCategories.name, trimmed));
    if (existing.length > 0) return existing[0].id;
  }

  const inserted = await db
    .insert(childCategories)
    .values({ name: trimmed, parentCategoryId: parentCategoryId ?? 1 })
    .returning();
  return inserted[0].id;
}

export async function getPaymentMethodsCategorized() {
  try {
    const list = await db.select().from(paymentMethods).orderBy(paymentMethods.name);
    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch payment methods:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch payment methods';
    return { data: [], error: message };
  }
}

export async function getWorkTransactionsSummary() {
  try {
    await ensureTransactionsWorkTableExists();
    const userId = await getSafeUserId();
    const workRows = userId
      ? await db.select().from(transactionsWork).where(eq(transactionsWork.userId, userId))
      : await db.select().from(transactionsWork);

    if (workRows.length === 0) {
      return { data: null, error: null };
    }

    let totalIncome = 0;
    let totalExpense = 0;
    let minDate = workRows[0].date;
    let maxDate = workRows[0].date;

    workRows.forEach((row) => {
      const amount = row.amount || 0;
      if (row.type === '収入' || row.type === 'income') {
        totalIncome += amount;
      } else {
        totalExpense += amount;
      }
      if (row.date < minDate) minDate = row.date;
      if (row.date > maxDate) maxDate = row.date;
    });

    return {
      data: {
        count: workRows.length,
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        minDate,
        maxDate,
      },
      error: null,
    };
  } catch (error: unknown) {
    console.error('Failed to summarize transactions_work:', error);
    const message = error instanceof Error ? error.message : 'データ分析に失敗しました';
    return { data: null, error: message };
  }
}

export async function saveWorkToNormalizedTransactions() {
  try {
    await ensureTransactionsWorkTableExists();
    const userId = await getSafeUserId();

    // 1. Delete all existing records in normalized transactions table
    if (userId) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
    } else {
      await db.delete(transactions);
    }

    // 2. Fetch all records from transactions_work
    const workRows = userId
      ? await db.select().from(transactionsWork).where(eq(transactionsWork.userId, userId))
      : await db.select().from(transactionsWork);

    if (workRows.length === 0) {
      return { success: false, count: 0, error: 'transactions_work に分析・保存対象のデータが存在しません' };
    }

    // Pre-cache lookup maps to eliminate hundreds of sequential DB queries
    const typeCache = new Map<string, number>();
    const pmCache = new Map<string, number>();
    const parentCatCache = new Map<string, number>();
    const childCatCache = new Map<string, number>();

    const getCachedTypeId = async (name?: string | null) => {
      if (!name || !name.trim()) return null;
      const key = name.trim();
      if (typeCache.has(key)) return typeCache.get(key)!;
      const id = await getOrCreateTypeId(key);
      if (id !== null) typeCache.set(key, id);
      return id;
    };

    const getCachedPmId = async (name?: string | null) => {
      const normalized = normalizeName(name);
      if (!normalized) return null;
      if (pmCache.has(normalized)) return pmCache.get(normalized)!;
      const id = await getOrCreatePaymentMethodId(normalized);
      if (id !== null) pmCache.set(normalized, id);
      return id;
    };

    const getCachedParentCatId = async (name?: string | null) => {
      if (!name || !name.trim()) return null;
      const key = name.trim();
      if (parentCatCache.has(key)) return parentCatCache.get(key)!;
      const id = await getOrCreateParentCategoryId(key);
      if (id !== null) parentCatCache.set(key, id);
      return id;
    };

    const getCachedChildCatId = async (name?: string | null, parentId?: number | null) => {
      if (!name || !name.trim()) return null;
      const key = `${parentId ?? 1}:${name.trim()}`;
      if (childCatCache.has(key)) return childCatCache.get(key)!;
      const id = await getOrCreateChildCategoryId(name.trim(), parentId);
      if (id !== null) childCatCache.set(key, id);
      return id;
    };

    const txItems: (typeof transactions.$inferInsert)[] = [];

    for (const row of workRows) {
      const typeId = await getCachedTypeId(row.type);
      const paymentMethodId = await getCachedPmId(row.paymentMethod);
      const parentCategoryId = await getCachedParentCatId(row.parentCategory);
      const childCategoryId = await getCachedChildCatId(row.childCategory, parentCategoryId);

      const txItem: typeof transactions.$inferInsert = {
        date: row.date,
        typeId,
        paymentMethodId,
        parentCategoryId,
        childCategoryId,
        amount: row.amount ?? null,
        location: row.location,
        memo: row.memo,
        note: row.note,
        tag: row.tag,
      };

      if (userId) {
        txItem.userId = userId;
      }

      txItems.push(txItem);
    }

    // Batch insert normalized transactions in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < txItems.length; i += chunkSize) {
      const chunk = txItems.slice(i, i + chunkSize);
      await db.insert(transactions).values(chunk);
    }

    revalidatePath('/dashboard');
    revalidatePath('/import');
    return { success: true, count: txItems.length, error: null };
  } catch (error: unknown) {
    console.error('Failed to save transactions_work into transactions:', error);
    const message = error instanceof Error ? error.message : 'transactions テーブルへの保存に失敗しました';
    return { success: false, count: 0, error: message };
  }
}

export async function getTransactions() {
  try {
    const userId = await getSafeUserId();

    // Strictly query normalized transactions table
    const normalizedList = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        date: transactions.date,
        type: transactionTypes.name,
        paymentMethod: paymentMethods.name,
        paymentMethodId: transactions.paymentMethodId,
        paymentMethodType: paymentMethods.type,
        parentCategory: parentCategories.name,
        childCategory: childCategories.name,
        amount: transactions.amount,
        location: transactions.location,
        memo: transactions.memo,
        note: transactions.note,
        tag: transactions.tag,
        createdAt: transactions.createdAt,
      })
      .from(transactions)
      .leftJoin(transactionTypes, eq(transactions.typeId, transactionTypes.id))
      .leftJoin(paymentMethods, eq(transactions.paymentMethodId, paymentMethods.id))
      .leftJoin(parentCategories, eq(transactions.parentCategoryId, parentCategories.id))
      .leftJoin(childCategories, eq(transactions.childCategoryId, childCategories.id))
      .where(userId ? eq(transactions.userId, userId) : undefined)
      .orderBy(desc(transactions.date), desc(transactions.createdAt));

    const mapped = normalizedList.map((item) => ({
      ...item,
      type: item.type || '支出',
    }));
    return { data: mapped, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch transactions:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
    return { data: [], error: message };
  }
}

export async function addTransaction(formData: FormData) {
  try {
    await ensureTransactionsWorkTableExists();
    const userId = await getSafeUserId();

    const amountStr = formData.get('amount') as string;
    const type = (formData.get('type') as string) || '支出';
    const parentCategory = (formData.get('parentCategory') as string) || (formData.get('category') as string) || 'その他';
    const childCategory = formData.get('childCategory') as string || undefined;
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];
    const memo = formData.get('memo') as string || (formData.get('title') as string) || undefined;
    const location = formData.get('location') as string || undefined;
    const paymentMethod = formData.get('paymentMethod') as string || undefined;
    const note = formData.get('note') as string || undefined;
    const tag = formData.get('tag') as string || undefined;

    const amount = amountStr ? parseInt(amountStr, 10) : null;

    // Resolve lookup IDs
    const typeId = await getOrCreateTypeId(type);
    const paymentMethodId = await getOrCreatePaymentMethodId(paymentMethod);
    const parentCategoryId = await getOrCreateParentCategoryId(parentCategory);
    const childCategoryId = await getOrCreateChildCategoryId(childCategory, parentCategoryId);

    const insertValues: typeof transactions.$inferInsert = {
      date,
      typeId,
      paymentMethodId,
      parentCategoryId,
      childCategoryId,
      amount: amount && !isNaN(amount) ? amount : null,
      location,
      memo,
      note,
      tag,
    };

    const workValues: typeof transactionsWork.$inferInsert = {
      date,
      type,
      paymentMethod,
      parentCategory,
      childCategory,
      amount: amount && !isNaN(amount) ? amount : null,
      location,
      memo,
      note,
      tag,
    };

    if (userId) {
      insertValues.userId = userId;
      workValues.userId = userId;
    }

    await db.insert(transactions).values(insertValues);
    await db.insert(transactionsWork).values(workValues);

    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to add transaction:', error);
    const message = error instanceof Error ? error.message : '取引の追加に失敗しました';
    return { success: false, error: message };
  }
}

export async function getCardSettingsFromDb() {
  try {
    const list = await db.select().from(cardSettings);
    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch card settings:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch card settings';
    return { data: [], error: message };
  }
}

export async function upsertCardSettingInDb(
  cardName: string,
  setting: { isCreditCard?: boolean; closingDay: number; paymentMonthOffset: number; paymentDay: number; linkedBankAccount?: string }
) {
  try {
    const normalizedCardName = normalizeName(cardName);
    if (!normalizedCardName) {
      return { success: false, error: 'カード名が無効です' };
    }
    const isCreditCard = setting.isCreditCard ?? true;
    const linkedBankAccount = setting.linkedBankAccount ? normalizeName(setting.linkedBankAccount) : null;
    const paymentMethodId = await getOrCreatePaymentMethodId(normalizedCardName, 'credit_card');

    // Check existing
    const allSettings = await db.select().from(cardSettings);
    const existing = allSettings.find((s) => normalizeName(s.cardName) === normalizedCardName);

    if (existing) {
      await db
        .update(cardSettings)
        .set({
          paymentMethodId,
          isCreditCard,
          closingDay: setting.closingDay,
          paymentMonthOffset: setting.paymentMonthOffset,
          paymentDay: setting.paymentDay,
          linkedBankAccount,
          updatedAt: new Date(),
        })
        .where(eq(cardSettings.id, existing.id));
    } else {
      await db.insert(cardSettings).values({
        paymentMethodId,
        cardName: normalizedCardName,
        isCreditCard,
        closingDay: setting.closingDay,
        paymentMonthOffset: setting.paymentMonthOffset,
        paymentDay: setting.paymentDay,
        linkedBankAccount,
      });
    }

    revalidatePath('/cards');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to upsert card setting:', error);
    const message = error instanceof Error ? error.message : 'カード設定の保存に失敗しました';
    return { success: false, error: message };
  }
}

export async function importCsv(formData: FormData) {
  try {
    const client = postgres(process.env.DATABASE_URL!, {
      prepare: false,
      ssl: process.env.DATABASE_SSL === 'true' ? {} : false,
      max: 1,
      connect_timeout: 10,
    });
    const db = drizzle({ client, schema });
    const userId = await getSafeUserId();

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'ファイルを選択してください' };
    }

    const csvText = await file.text();
    const rows = parseHouseholdCsv(csvText);

    if (rows.length === 0) {
      return { success: false, error: '有効なデータが見つかりませんでした' };
    }
    console.log('userId:', userId);

    // Clear existing records in transactionsWork
    if (userId) {
      await db.delete(transactionsWork).where(eq(transactionsWork.userId, userId));
    } else {
      return { success: false };
    }

    console.log('inferInsert Start:');

    if (rows.length > 0) {
      const workItems: (typeof transactionsWork.$inferInsert)[] = rows.map((row) => {
        const item: typeof transactionsWork.$inferInsert = {
          date: row.date,
          type: row.type,
          paymentMethod: row.paymentMethod,
          parentCategory: row.parentCategory,
          childCategory: row.childCategory,
          amount: row.amount ?? null,
          location: row.location,
          memo: row.memo,
          note: row.note,
          tag: row.tag,
        };
        if (userId) {
          item.userId = userId;
        }
        return item;
      });

      // Batch insert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < workItems.length; i += chunkSize) {
        const chunk = workItems.slice(i, i + chunkSize);
        await db.insert(transactionsWork).values(chunk);
      }
    }

    revalidatePath('/dashboard');
    revalidatePath('/import');
    return { success: true, count: rows.length, error: null };
  } catch (error: unknown) {
    console.error('Failed to import CSV:', error);
    const message = error instanceof Error ? error.message : 'CSVのインポートに失敗しました';
    return { success: false, error: message };
  }
}

export async function updateTransaction(id: number, formData: FormData) {
  try {
    await ensureTransactionsWorkTableExists();
    const amountStr = formData.get('amount') as string;
    const type = (formData.get('type') as string) || '支出';
    const parentCategory = (formData.get('parentCategory') as string) || (formData.get('category') as string) || 'その他';
    const childCategory = (formData.get('childCategory') as string) || undefined;
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];
    const memo = (formData.get('memo') as string) || (formData.get('title') as string) || undefined;
    const location = (formData.get('location') as string) || undefined;
    const paymentMethod = (formData.get('paymentMethod') as string) || undefined;
    const note = (formData.get('note') as string) || undefined;
    const tag = (formData.get('tag') as string) || undefined;

    const amount = amountStr ? parseInt(amountStr, 10) : null;

    const typeId = await getOrCreateTypeId(type);
    const paymentMethodId = await getOrCreatePaymentMethodId(paymentMethod);
    const parentCategoryId = await getOrCreateParentCategoryId(parentCategory);
    const childCategoryId = await getOrCreateChildCategoryId(childCategory, parentCategoryId);

    await db
      .update(transactions)
      .set({
        date,
        typeId,
        paymentMethodId: paymentMethodId || null,
        parentCategoryId,
        childCategoryId: childCategoryId || null,
        amount: amount && !isNaN(amount) ? amount : null,
        location: location || null,
        memo: memo || null,
        note: note || null,
        tag: tag || null,
      })
      .where(eq(transactions.id, id));

    await db
      .update(transactionsWork)
      .set({
        date,
        type,
        paymentMethod: paymentMethod || null,
        parentCategory,
        childCategory: childCategory || null,
        amount: amount && !isNaN(amount) ? amount : null,
        location: location || null,
        memo: memo || null,
        note: note || null,
        tag: tag || null,
      })
      .where(eq(transactionsWork.id, id));

    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to update transaction:', error);
    const message = error instanceof Error ? error.message : '取引の更新に失敗しました';
    return { success: false, error: message };
  }
}

export async function deleteTransaction(id: number) {
  try {
    await ensureTransactionsWorkTableExists();
    await db.delete(transactions).where(eq(transactions.id, id));
    await db.delete(transactionsWork).where(eq(transactionsWork.id, id));
    revalidatePath('/dashboard');
    revalidatePath('/cards');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to delete transaction:', error);
    const message = error instanceof Error ? error.message : '取引の削除に失敗しました';
    return { success: false, error: message };
  }
}

export async function updatePaymentMethodName(oldName: string, newName: string) {
  try {
    await ensureTransactionsWorkTableExists();
    if (!oldName || !newName || oldName.trim() === newName.trim()) {
      return { success: false, error: '変更前後のカード名を入力してください' };
    }

    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    // Update paymentMethods lookup table
    const existing = await db.select().from(paymentMethods).where(eq(paymentMethods.name, trimmedOld));
    if (existing.length > 0) {
      await db.update(paymentMethods).set({ name: trimmedNew }).where(eq(paymentMethods.name, trimmedOld));
    }

    await db
      .update(transactionsWork)
      .set({ paymentMethod: trimmedNew })
      .where(eq(transactionsWork.paymentMethod, trimmedOld));

    revalidatePath('/dashboard');
    revalidatePath('/cards');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to update payment method name:', error);
    const message = error instanceof Error ? error.message : 'カード名の更新に失敗しました';
    return { success: false, error: message };
  }
}

// ==========================================
// Bank Accounts & Balances Server Actions
// ==========================================

export async function getBankAccounts() {
  try {
    const userId = await getSafeUserId();

    const list = userId
      ? await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId)).orderBy(desc(bankAccounts.createdAt))
      : await db.select().from(bankAccounts).orderBy(desc(bankAccounts.createdAt));

    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch bank accounts:', error);
    const message = error instanceof Error ? error.message : '銀行口座一覧の取得に失敗しました';
    return { data: [], error: message };
  }
}

export async function addBankAccount(accountName: string, bankName?: string, accountNumber?: string) {
  try {
    const normalizedAccName = normalizeName(accountName);
    if (!normalizedAccName) {
      return { success: false, error: '口座名を入力してください' };
    }
    const userId = await getSafeUserId();
    const paymentMethodId = await getOrCreatePaymentMethodId(normalizedAccName, 'bank_account');

    // Check if account already exists with normalized name
    const existingAccounts = await db.select().from(bankAccounts);
    const existing = existingAccounts.find((a) => normalizeName(a.accountName) === normalizedAccName);
    if (existing) {
      return { success: true, data: existing, error: null };
    }

    const insertValues: typeof bankAccounts.$inferInsert = {
      paymentMethodId,
      accountName: normalizedAccName,
      bankName: bankName ? normalizeName(bankName) : null,
      accountNumber: accountNumber?.trim() || null,
    };

    if (userId) {
      insertValues.userId = userId;
    }

    const inserted = await db.insert(bankAccounts).values(insertValues).returning();

    revalidatePath('/accounts');
    return { success: true, data: inserted[0], error: null };
  } catch (error: unknown) {
    console.error('Failed to add bank account:', error);
    const message = error instanceof Error ? error.message : '銀行口座の追加に失敗しました';
    return { success: false, data: null, error: message };
  }
}

export async function deleteBankAccount(id: number) {
  try {
    await db.delete(bankAccounts).where(eq(bankAccounts.id, id));
    revalidatePath('/accounts');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to delete bank account:', error);
    const message = error instanceof Error ? error.message : '銀行口座の削除に失敗しました';
    return { success: false, error: message };
  }
}

export async function getBankBalances(accountName?: string) {
  try {
    const userId = await getSafeUserId();

    const query = db
      .select({
        id: bankBalances.id,
        userId: bankBalances.userId,
        bankAccountId: bankBalances.bankAccountId,
        accountName: bankAccounts.accountName,
        recordDate: bankBalances.recordDate,
        balance: bankBalances.balance,
        memo: bankBalances.memo,
        createdAt: bankBalances.createdAt,
      })
      .from(bankBalances)
      .innerJoin(bankAccounts, eq(bankBalances.bankAccountId, bankAccounts.id));

    if (accountName) {
      const list = userId
        ? await query.where(and(eq(bankBalances.userId, userId), eq(bankAccounts.accountName, accountName))).orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt))
        : await query.where(eq(bankAccounts.accountName, accountName)).orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt));
      return { data: list, error: null };
    }

    const list = userId
      ? await query.where(eq(bankBalances.userId, userId)).orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt))
      : await query.orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt));

    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch bank balances:', error);
    const message = error instanceof Error ? error.message : '口座残高履歴の取得に失敗しました';
    return { data: [], error: message };
  }
}

export async function addBankBalanceRecord(accountName: string, balance: number, recordDate: string, memo?: string) {
  try {
    const normalizedAccName = normalizeName(accountName);
    if (!normalizedAccName) {
      return { success: false, error: '口座名が無効です' };
    }
    if (isNaN(balance)) {
      return { success: false, error: '有効な残高金額を入力してください' };
    }

    const userId = await getSafeUserId();

    // Find bankAccountId by accountName or create bankAccount
    const allAccounts = await db.select().from(bankAccounts);
    const existing = allAccounts.find((a) => normalizeName(a.accountName) === normalizedAccName);

    let bankAccountId: number;
    if (existing) {
      bankAccountId = existing.id;
    } else {
      const addRes = await addBankAccount(normalizedAccName);
      if (!addRes.success || !addRes.data) {
        return { success: false, error: '銀行口座の自動登録に失敗しました' };
      }
      bankAccountId = addRes.data.id;
    }

    const insertValues: typeof bankBalances.$inferInsert = {
      bankAccountId,
      recordDate: recordDate || new Date().toISOString().split('T')[0],
      balance,
      memo: memo?.trim() || null,
    };

    if (userId) {
      insertValues.userId = userId;
    }

    await db.insert(bankBalances).values(insertValues);

    revalidatePath('/accounts');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to add bank balance record:', error);
    const message = error instanceof Error ? error.message : '残高記録の追加に失敗しました';
    return { success: false, error: message };
  }
}

export async function deleteBankBalanceRecord(id: number) {
  try {
    await db.delete(bankBalances).where(eq(bankBalances.id, id));
    revalidatePath('/accounts');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to delete bank balance record:', error);
    const message = error instanceof Error ? error.message : '残高記録の削除に失敗しました';
    return { success: false, error: message };
  }
}
