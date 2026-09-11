'use server';

import { db } from '@/src/db';
import { transactions } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export async function getTransactions() {
  try {
    const list = await db.select().from(transactions).orderBy(desc(transactions.date), desc(transactions.createdAt));
    return { data: list, error: null };
  } catch (error: unknown) {
    console.error('Failed to fetch transactions:', error);
    const message = error instanceof Error ? error.message : 'Failed to fetch transactions';
    return { data: [], error: message };
  }
}

export async function addTransaction(formData: FormData) {
  try {
    const title = formData.get('title') as string;
    const amountStr = formData.get('amount') as string;
    const type = (formData.get('type') as 'income' | 'expense') || 'expense';
    const category = formData.get('category') as string;
    const date = (formData.get('date') as string) || new Date().toISOString().split('T')[0];

    if (!title || !amountStr || !category) {
      return { success: false, error: 'タイトル、金額、カテゴリーは必須です' };
    }

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      return { success: false, error: '金額は1以上の数値を入力してください' };
    }

    await db.insert(transactions).values({
      title,
      amount,
      type,
      category,
      date,
    });

    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to add transaction:', error);
    const message = error instanceof Error ? error.message : '取引の追加に失敗しました';
    return { success: false, error: message };
  }
}

export async function deleteTransaction(id: string) {
  try {
    await db.delete(transactions).where(eq(transactions.id, id));
    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to delete transaction:', error);
    const message = error instanceof Error ? error.message : '取引の削除に失敗しました';
    return { success: false, error: message };
  }
}
