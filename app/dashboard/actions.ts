'use server';

import { db } from '@/src/db';
import { transactionsWork } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { parseHouseholdCsv } from '@/lib/csv';
import { createClient } from '@/lib/supabase/server';

export async function getTransactions() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.id) {
      const list = await db
        .select()
        .from(transactionsWork)
        .where(eq(transactionsWork.userId, user.id))
        .orderBy(desc(transactionsWork.date), desc(transactionsWork.createdAt));
      return { data: list, error: null };
    }

    const list = await db
      .select()
      .from(transactionsWork)
      .orderBy(desc(transactionsWork.date), desc(transactionsWork.createdAt));
    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch transactions:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
    return { data: [], error: message };
  }
}

export async function addTransaction(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

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

    const insertValues: typeof transactionsWork.$inferInsert = {
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

    if (user?.id) {
      insertValues.userId = user.id;
    }

    await db.insert(transactionsWork).values(insertValues);

    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to add transaction:', error);
    const message = error instanceof Error ? error.message : '取引の追加に失敗しました';
    return { success: false, error: message };
  }
}

export async function importCsv(formData: FormData) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'ファイルを選択してください' };
    }

    const csvText = await file.text();
    const rows = parseHouseholdCsv(csvText);

    if (rows.length === 0) {
      return { success: false, error: '有効なデータが見つかりませんでした' };
    }

    // Overwrite transactions_work database by deleting existing records for user if logged in, or all if not
    if (user?.id) {
      await db.delete(transactionsWork).where(eq(transactionsWork.userId, user.id));
    } else {
      await db.delete(transactionsWork);
    }

    if (rows.length > 0) {
      await db.insert(transactionsWork).values(
        rows.map((row) => {
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
          if (user?.id) {
            item.userId = user.id;
          }
          return item;
        })
      );
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!oldName || !newName || oldName.trim() === newName.trim()) {
      return { success: false, error: '変更前後のカード名を入力してください' };
    }

    const trimmedOld = oldName.trim();
    const trimmedNew = newName.trim();

    if (user?.id) {
      await db
        .update(transactionsWork)
        .set({ paymentMethod: trimmedNew })
        .where(eq(transactionsWork.paymentMethod, trimmedOld));
    } else {
      await db
        .update(transactionsWork)
        .set({ paymentMethod: trimmedNew })
        .where(eq(transactionsWork.paymentMethod, trimmedOld));
    }

    revalidatePath('/dashboard');
    revalidatePath('/cards');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to update payment method name:', error);
    const message = error instanceof Error ? error.message : 'カード名の更新に失敗しました';
    return { success: false, error: message };
  }
}
