'use client';

import { useState, useEffect, useTransition } from 'react';
import { getTransactions, addTransaction, deleteTransaction, importCsv } from './actions';
import Link from 'next/link';

interface TransactionWorkItem {
  id: number;
  userId: string;
  date: string;
  type: string;
  paymentMethod?: string | null;
  parentCategory?: string | null;
  childCategory?: string | null;
  amount?: number | null;
  location?: string | null;
  memo?: string | null;
  note?: string | null;
  tag?: string | null;
  createdAt: Date | string;
}

const CATEGORIES = {
  支出: ['食費', '日用品', '交通費', '居住費', '光熱費', '娯楽', '交際費', 'その他'],
  収入: ['給料', '副収入', '臨時収入', 'その他'],
};

export default function Dashboard() {
  const [items, setItems] = useState<TransactionWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [type, setType] = useState<'支出' | '収入'>('支出');
  const [parentCategory, setParentCategory] = useState(CATEGORIES['支出'][0]);
  const [isPending, startTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const loadData = async () => {
    const res = await getTransactions();
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setItems(res.data as TransactionWorkItem[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    getTransactions().then((res) => {
      if (!ignore) {
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setItems(res.data as TransactionWorkItem[]);
        }
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
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
        setErrorMsg(res.error || '追加に失敗しました');
      } else {
        form.reset();
        setType('支出');
        setParentCategory(CATEGORIES['支出'][0]);
        await loadData();
      }
    });
  };

  const handleImportCsv = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedFile) {
      setErrorMsg('CSVファイルを選択してください');
      return;
    }

    if (!confirm('既存の全データが削除され、取り込んだCSVファイルの内容でtransactions_workテーブルが上書きされます。実行しますか？')) {
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    startTransition(async () => {
      const res = await importCsv(formData);
      if (!res.success) {
        setErrorMsg(res.error || 'CSVの取り込みに失敗しました');
      } else {
        setSuccessMsg(`transactions_work テーブルに CSV を取り込みました (${res.count} 件)`);
        setSelectedFile(null);
        await loadData();
      }
    });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この明細を削除しますか？')) return;
    startTransition(async () => {
      const res = await deleteTransaction(id);
      if (!res.success) {
        setErrorMsg(res.error || '削除に失敗しました');
      } else {
        await loadData();
      }
    });
  };

  const totalIncome = items
    .filter((i) => i.type === '収入' || i.type === 'income')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const totalExpense = items
    .filter((i) => i.type === '支出' || i.type === 'expense')
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const balance = totalIncome - totalExpense;

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">家計簿ダッシュボード (transactions_work)</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              transactions_work テーブルの記録・管理
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <Link
              href="/card-types"
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
            >
              カード種類管理 →
            </Link>
            <Link
              href="/"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              ← ホームに戻る
            </Link>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded-lg text-sm">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-4 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 rounded-lg text-sm">
            {successMsg}
          </div>
        )}

        {/* CSV Import Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold mb-2">CSVファイルからの取込（transactions_work へ上書き）</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            家計簿のCSVを取り込み、public.transactions_work テーブルに格納します。
          </p>
          <form onSubmit={handleImportCsv} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 dark:file:bg-blue-900/40 dark:file:text-blue-300 hover:file:bg-blue-100 cursor-pointer"
            />
            <button
              type="submit"
              disabled={isPending || !selectedFile}
              className="whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg transition text-sm disabled:opacity-50"
            >
              {isPending ? '取り込み中...' : 'CSVを取り込んで上書き'}
            </button>
          </form>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              総収入
            </span>
            <div className="mt-2 text-2xl font-extrabold text-green-600 dark:text-green-400">
              ¥{totalIncome.toLocaleString()}
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              総支出
            </span>
            <div className="mt-2 text-2xl font-extrabold text-red-600 dark:text-red-400">
              ¥{totalExpense.toLocaleString()}
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              収支バランス
            </span>
            <div
              className={`mt-2 text-2xl font-extrabold ${
                balance >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              ¥{balance.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Transaction Input Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold mb-4">収支の登録</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                区分
              </label>
              <select
                name="type"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as '支出' | '収入')}
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="支出">支出</option>
                <option value="収入">収入</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                親カテゴリー
              </label>
              <select
                name="parentCategory"
                value={parentCategory}
                onChange={(e) => setParentCategory(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                {CATEGORIES[type].map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                メモ
              </label>
              <input
                type="text"
                name="memo"
                placeholder="例: スーパーでの買い物"
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                金額 (円)
              </label>
              <input
                type="number"
                name="amount"
                placeholder="例: 1500"
                min="1"
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                日付
              </label>
              <input
                type="date"
                name="date"
                defaultValue={todayStr}
                required
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium p-2.5 rounded-lg transition text-sm disabled:opacity-50"
              >
                {isPending ? '追加中...' : '登録する'}
              </button>
            </div>
          </form>
        </div>

        {/* Transactions List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-bold">収支履歴 (transactions_work)</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              全 {items.length} 件
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              明細がありません。上のフォームから登録するかCSVを取り込んでください。
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => {
                const categoryLabel = item.childCategory || item.parentCategory || 'その他';
                const displayTitle = item.memo || item.note || item.location || categoryLabel;
                const isIncome = item.type === '収入' || item.type === 'income';

                return (
                  <div
                    key={item.id}
                    className="p-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          isIncome
                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {categoryLabel}
                      </span>
                      <div>
                        <div className="font-semibold text-sm sm:text-base">
                          {displayTitle}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                          {item.date} {item.paymentMethod ? `| ${item.paymentMethod}` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span
                        className={`font-bold text-sm sm:text-lg ${
                          isIncome
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isIncome ? '+' : '-'}¥
                        {(item.amount || 0).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isPending}
                        className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition"
                        title="削除"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
