'use client';

import { useState, useTransition, useEffect } from 'react';
import Navbar from '@/app/components/Navbar';
import { addTransaction, getTransactions } from '@/app/dashboard/actions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const CATEGORIES = {
  支出: ['食費', '日用品', '交通費', '居住費', '光熱費', '娯楽', '交際費', 'その他'],
  収入: ['給料', '副収入', '臨時収入', 'その他'],
};

export default function RegisterPage() {
  const router = useRouter();
  const [type, setType] = useState<'支出' | '収入'>('支出');
  const [parentCategory, setParentCategory] = useState<string>(CATEGORIES['支出'][0]);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uniquePaymentMethods, setUniquePaymentMethods] = useState<string[]>([]);

  useEffect(() => {
    getTransactions().then((res) => {
      if (res.data) {
        const methods = (res.data as Array<{ paymentMethod?: string | null }>)
          .map((i) => i.paymentMethod?.trim())
          .filter((m): m is string => Boolean(m && m.length > 0));
        setUniquePaymentMethods(Array.from(new Set(methods)).sort());
      }
    });
  }, []);

  const handleTypeChange = (newType: '支出' | '収入') => {
    setType(newType);
    setParentCategory(CATEGORIES[newType][0]);
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const res = await addTransaction(formData);
      if (!res.success) {
        setErrorMsg(res.error || '登録に失敗しました');
      } else {
        setSuccessMsg('収支を登録しました！');
        form.reset();
        setType('支出');
        setParentCategory(CATEGORIES['支出'][0]);
      }
    });
  };

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <datalist id="payment-methods-list">
        {uniquePaymentMethods.map((pm) => (
          <option key={pm} value={pm} />
        ))}
      </datalist>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">収支登録</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              日々の収入・支出を手動で個別登録します。
            </p>
          </div>
          <Link
            href="/dashboard"
            className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition"
          >
            ← 閲覧画面 (月別集計) へ戻る
          </Link>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex justify-between items-center">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="font-bold">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-green-100 dark:bg-green-900/40 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl text-sm flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span>✅</span>
              <span>{successMsg}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-xs underline font-semibold hover:opacity-80"
              >
                閲覧画面で確認する
              </button>
              <button onClick={() => setSuccessMsg(null)} className="font-bold">✕</button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <form onSubmit={handleAdd} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  区分 <span className="text-red-500">*</span>
                </label>
                <select
                  name="type"
                  value={type}
                  onChange={(e) => handleTypeChange(e.target.value as '支出' | '収入')}
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="支出">支出</option>
                  <option value="収入">収入</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  カテゴリー <span className="text-red-500">*</span>
                </label>
                <select
                  name="parentCategory"
                  value={parentCategory}
                  onChange={(e) => setParentCategory(e.target.value)}
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {CATEGORIES[type].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  カード・支払い方法
                </label>
                <input
                  type="text"
                  name="paymentMethod"
                  list="payment-methods-list"
                  placeholder="例: 楽天カード、現金"
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  日付 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="date"
                  defaultValue={todayStr}
                  required
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  金額 (円) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="amount"
                  placeholder="例: 1500"
                  min="1"
                  required
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  メモ
                </label>
                <input
                  type="text"
                  name="memo"
                  placeholder="例: イオンで買い物"
                  className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <Link
                href="/dashboard"
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                キャンセルして一覧へ戻る
              </Link>

              <button
                type="submit"
                disabled={isPending}
                className="px-8 bg-blue-600 hover:bg-blue-700 text-white font-bold p-3 rounded-xl transition text-sm shadow disabled:opacity-50"
              >
                {isPending ? '登録中...' : '登録する'}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
