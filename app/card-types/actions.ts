'use server';

import { db } from '@/src/db';
import { cardTypes, transactionsWork, transactions } from '@/src/db/schema';
import { eq, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/lib/supabase/server';
import { extractUniquePaymentMethods, filterNewPaymentMethods } from '@/lib/card-types';

export interface CardTypeItem {
  id: string;
  userId?: string | null;
  name: string;
  paymentMethod?: string | null;
  note?: string | null;
  createdAt: Date | string;
}

// In-memory fallback for local dev environment without DATABASE_URL
let inMemoryCardTypes: CardTypeItem[] = [];

export async function getCardTypes() {
  try {
    const user = await getAuthUser();

    if (user?.id) {
      const list = await db
        .select()
        .from(cardTypes)
        .where(eq(cardTypes.userId, user.id))
        .orderBy(desc(cardTypes.createdAt));
      return { data: list as CardTypeItem[], error: null };
    }

    const list = await db
      .select()
      .from(cardTypes)
      .orderBy(desc(cardTypes.createdAt));
    return { data: list as CardTypeItem[], error: null };
  } catch (error: unknown) {
    console.warn('DB not available, using in-memory fallback for card types:', error);
    return { data: inMemoryCardTypes, error: null };
  }
}

export async function addCardType(formData: FormData) {
  try {
    const user = await getAuthUser();

    const name = (formData.get('name') as string)?.trim();
    const paymentMethod = (formData.get('paymentMethod') as string)?.trim() || null;
    const note = (formData.get('note') as string)?.trim() || null;

    if (!name) {
      return { success: false, error: 'カード種類名を入力してください' };
    }

    const insertValues: typeof cardTypes.$inferInsert = {
      name,
      paymentMethod,
      note,
    };

    if (user?.id) {
      insertValues.userId = user.id;
    }

    try {
      await db.insert(cardTypes).values(insertValues);
    } catch {
      // Fallback
      const newItem: CardTypeItem = {
        id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        userId: user?.id || null,
        name,
        paymentMethod,
        note,
        createdAt: new Date().toISOString(),
      };
      inMemoryCardTypes.unshift(newItem);
    }

    revalidatePath('/card-types');
    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to add card type:', error);
    const message = error instanceof Error ? error.message : 'カード種類の追加に失敗しました';
    return { success: false, error: message };
  }
}

export async function updateCardType(id: string, formData: FormData) {
  try {
    const name = (formData.get('name') as string)?.trim();
    const paymentMethod = (formData.get('paymentMethod') as string)?.trim() || null;
    const note = (formData.get('note') as string)?.trim() || null;

    if (!name) {
      return { success: false, error: 'カード種類名を入力してください' };
    }

    try {
      await db
        .update(cardTypes)
        .set({
          name,
          paymentMethod,
          note,
        })
        .where(eq(cardTypes.id, id));
    } catch {
      // Fallback
      inMemoryCardTypes = inMemoryCardTypes.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            name,
            paymentMethod,
            note,
          };
        }
        return item;
      });
    }

    revalidatePath('/card-types');
    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to update card type:', error);
    const message = error instanceof Error ? error.message : 'カード種類の更新に失敗しました';
    return { success: false, error: message };
  }
}

export async function deleteCardType(id: string) {
  try {
    try {
      await db.delete(cardTypes).where(eq(cardTypes.id, id));
    } catch {
      // Fallback
      inMemoryCardTypes = inMemoryCardTypes.filter((item) => item.id !== id);
    }

    revalidatePath('/card-types');
    revalidatePath('/dashboard');
    return { success: true, error: null };
  } catch (error: unknown) {
    console.error('Failed to delete card type:', error);
    const message = error instanceof Error ? error.message : 'カード種類の削除に失敗しました';
    return { success: false, error: message };
  }
}

export async function syncCardTypesFromTransactions() {
  try {
    const user = await getAuthUser();

    // Collect distinct non-null payment_method from transactions_work & transactions
    let workList: { paymentMethod: string | null }[] = [];
    let mainList: { paymentMethod: string | null }[] = [];

    try {
      if (user?.id) {
        workList = await db
          .select({ paymentMethod: transactionsWork.paymentMethod })
          .from(transactionsWork)
          .where(eq(transactionsWork.userId, user.id));

        mainList = await db
          .select({ paymentMethod: transactions.paymentMethod })
          .from(transactions);
      } else {
        workList = await db
          .select({ paymentMethod: transactionsWork.paymentMethod })
          .from(transactionsWork);

        mainList = await db
          .select({ paymentMethod: transactions.paymentMethod })
          .from(transactions);
      }
    } catch {
      // DB not available
    }

    const uniqueMethods = extractUniquePaymentMethods([...workList, ...mainList]);

    if (uniqueMethods.length === 0) {
      return { success: true, count: 0, error: null, message: '取り込まれた payment_method データがありません' };
    }

    // Fetch existing card types to avoid duplicate imports
    const existingCardTypesRes = await getCardTypes();
    const existing = existingCardTypesRes.data || [];
    const newMethods = filterNewPaymentMethods(uniqueMethods, existing);

    if (newMethods.length === 0) {
      return { success: true, count: 0, error: null, message: '全ての payment_method は既にカード種類テーブルに登録されています' };
    }

    const insertValues = newMethods.map((pm) => {
      const item: typeof cardTypes.$inferInsert = {
        name: pm,
        paymentMethod: pm,
        note: 'transactionsから自動同期',
      };
      if (user?.id) {
        item.userId = user.id;
      }
      return item;
    });

    try {
      await db.insert(cardTypes).values(insertValues);
    } catch {
      for (const pm of newMethods) {
        inMemoryCardTypes.unshift({
          id: 'mem-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
          userId: user?.id || null,
          name: pm,
          paymentMethod: pm,
          note: 'transactionsから自動同期',
          createdAt: new Date().toISOString(),
        });
      }
    }

    revalidatePath('/card-types');
    revalidatePath('/dashboard');
    return { success: true, count: newMethods.length, error: null, message: `${newMethods.length} 件の payment_method からカード種類を同期しました` };
  } catch (error: unknown) {
    console.error('Failed to sync card types:', error);
    const message = error instanceof Error ? error.message : 'カード種類の同期に失敗しました';
    return { success: false, count: 0, error: message };
  }
}
