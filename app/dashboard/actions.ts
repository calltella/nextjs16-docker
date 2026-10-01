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

// Helper functions for normalized lookup records
async function getOrCreateTypeId(name?: string | null): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select().from(transactionTypes).where(eq(transactionTypes.name, trimmed));
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(transactionTypes).values({ name: trimmed }).returning();
  return inserted[0].id;
}

async function getOrCreatePaymentMethodId(name?: string | null): Promise<number | null> {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();
  const existing = await db.select().from(paymentMethods).where(eq(paymentMethods.name, trimmed));
  if (existing.length > 0) return existing[0].id;
  const inserted = await db.insert(paymentMethods).values({ name: trimmed }).returning();
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
  const existing = await db.select().from(childCategories).where(eq(childCategories.name, trimmed));
  if (existing.length > 0) return existing[0].id;
  const inserted = await db
    .insert(childCategories)
    .values({ name: trimmed, parentCategoryId: parentCategoryId ?? null })
    .returning();
  return inserted[0].id;
}

export async function getWorkTransactionsSummary() {
  try {
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

    let insertedCount = 0;
    for (const row of workRows) {
      const typeId = await getOrCreateTypeId(row.type);
      const paymentMethodId = await getOrCreatePaymentMethodId(row.paymentMethod);
      const parentCategoryId = await getOrCreateParentCategoryId(row.parentCategory);
      const childCategoryId = await getOrCreateChildCategoryId(row.childCategory, parentCategoryId);

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

      await db.insert(transactions).values(txItem);
      insertedCount++;
    }

    revalidatePath('/dashboard');
    revalidatePath('/import');
    return { success: true, count: insertedCount, error: null };
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
  setting: { isCreditCard?: boolean; closingDay: number; paymentMonthOffset: number; paymentDay: number }
) {
  try {
    if (!cardName || !cardName.trim()) {
      return { success: false, error: 'カード名が無効です' };
    }
    const trimmedCardName = cardName.trim();
    const isCreditCard = setting.isCreditCard ?? true;

    // Check existing
    const existing = await db
      .select()
      .from(cardSettings)
      .where(eq(cardSettings.cardName, trimmedCardName));

    if (existing.length > 0) {
      await db
        .update(cardSettings)
        .set({
          isCreditCard,
          closingDay: setting.closingDay,
          paymentMonthOffset: setting.paymentMonthOffset,
          paymentDay: setting.paymentDay,
          updatedAt: new Date(),
        })
        .where(eq(cardSettings.cardName, trimmedCardName));
    } else {
      await db.insert(cardSettings).values({
        cardName: trimmedCardName,
        isCreditCard,
        closingDay: setting.closingDay,
        paymentMonthOffset: setting.paymentMonthOffset,
        paymentDay: setting.paymentDay,
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

    // Clear existing records in transactionsWork
    if (userId) {
      await db.delete(transactionsWork).where(eq(transactionsWork.userId, userId));
    } else {
      await db.delete(transactionsWork);
    }

    if (rows.length > 0) {
      for (const row of rows) {
        const workItem: typeof transactionsWork.$inferInsert = {
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
          workItem.userId = userId;
        }

        await db.insert(transactionsWork).values(workItem);
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
    if (!accountName || !accountName.trim()) {
      return { success: false, error: '口座名を入力してください' };
    }
    const userId = await getSafeUserId();

    const insertValues: typeof bankAccounts.$inferInsert = {
      accountName: accountName.trim(),
      bankName: bankName?.trim() || null,
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

    const query = db.select().from(bankBalances);

    if (accountName) {
      const list = userId
        ? await query.where(and(eq(bankBalances.userId, userId), eq(bankBalances.accountName, accountName))).orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt))
        : await query.where(eq(bankBalances.accountName, accountName)).orderBy(desc(bankBalances.recordDate), desc(bankBalances.createdAt));
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
    if (!accountName || !accountName.trim()) {
      return { success: false, error: '口座名が無効です' };
    }
    if (isNaN(balance)) {
      return { success: false, error: '有効な残高金額を入力してください' };
    }

    const userId = await getSafeUserId();

    const insertValues: typeof bankBalances.$inferInsert = {
      accountName: accountName.trim(),
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
