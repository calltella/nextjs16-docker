'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import Navbar from '@/app/components/Navbar';
import { getTransactions, updateTransaction, deleteTransaction, updatePaymentMethodName } from '@/app/dashboard/actions';
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

export default function CardsPage() {
  const [items, setItems] = useState<TransactionWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedCardState, setSelectedCardState] = useState<string | null>(null);
  const [renamingCard, setRenamingCard] = useState<string | null>(null);
  const [newCardName, setNewCardName] = useState<string>('');

  const [editingItem, setEditingItem] = useState<TransactionWorkItem | null>(null);
  const [isPending, startTransition] = useTransition();

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

  // Summary per payment method / credit card
  const cardsSummary = useMemo(() => {
    const map: Record<
      string,
      { count: number; totalExpense: number; totalIncome: number; latestDate: string }
    > = {};

    items.forEach((item) => {
      const pm = item.paymentMethod?.trim() || '未設定・その他';
      if (!map[pm]) {
        map[pm] = { count: 0, totalExpense: 0, totalIncome: 0, latestDate: '' };
      }
      map[pm].count += 1;
      if (item.type === '支出' || item.type === 'expense') {
        map[pm].totalExpense += item.amount || 0;
      } else if (item.type === '収入' || item.type === 'income') {
        map[pm].totalIncome += item.amount || 0;
      }
      if (!map[pm].latestDate || (item.date && item.date > map[pm].latestDate)) {
        map[pm].latestDate = item.date;
      }
    });

    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [items]);

  const selectedCard = selectedCardState ?? (cardsSummary.length > 0 ? cardsSummary[0][0] : '');
  const setSelectedCard = (card: string) => setSelectedCardState(card);

  // Transactions for selected card
  const cardTransactions = useMemo(() => {
    if (!selectedCard) return [];
    return items
      .filter((i) => {
        const pm = i.paymentMethod?.trim() || '未設定・その他';
        return pm === selectedCard;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [items, selectedCard]);

  const handleRenameCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingCard || !newCardName.trim()) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const oldName = renamingCard === '未設定・その他' ? '' : renamingCard;
      const res = await updatePaymentMethodName(oldName, newCardName.trim());
      if (!res.success) {
        setErrorMsg(res.error || 'カード名の変更に失敗しました');
      } else {
        setSuccessMsg(`「${renamingCard}」の名称を「${newCardName.trim()}」に変更しました`);
        setSelectedCard(newCardName.trim());
        setRenamingCard(null);
        setNewCardName('');
        await loadData();
      }
    });
  };

  const handleUpdateTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateTransaction(editingItem.id, formData);
      if (!res.success) {
        setErrorMsg(res.error || '更新に失敗しました');
      } else {
        setSuccessMsg('明細を更新しました');
        setEditingItem(null);
        await loadData();
      }
    });
  };

  const handleDeleteTransaction = async (id: number) => {
    if (!confirm('この明細を削除しますか？')) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await deleteTransaction(id);
      if (!res.success) {
        setErrorMsg(res.error || '削除に失敗しました');
      } else {
        setSuccessMsg('明細を削除しました');
        await loadData();
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">クレジットカード別・支払い方法管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              登録されたクレジットカード・支払い方法ごとの明細確認・一括名称変更・個別の編集が行えます。
            </p>
          </div>

          <Link
            href="/dashboard"
            className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition"
          >
            ← 月別集計画面へ
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
            <span>✅ {successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="font-bold">✕</button>
          </div>
        )}

        {/* Cards Summary Cards Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>💳</span> クレジットカード・支払い方法一覧
          </h2>

          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : cardsSummary.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-sm">
              クレジットカード・支払い方法の登録データがありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {cardsSummary.map(([cardName, info]) => {
                const isSelected = selectedCard === cardName;
                return (
                  <div
                    key={cardName}
                    onClick={() => setSelectedCard(cardName)}
                    className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm flex flex-col justify-between ${
                      isSelected
                        ? 'bg-blue-50/80 dark:bg-blue-900/30 border-blue-500 ring-2 ring-blue-500/20'
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-base truncate flex items-center gap-1.5">
                          <span>💳</span>
                          <span>{cardName}</span>
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 font-semibold text-gray-600 dark:text-gray-300">
                          {info.count}件
                        </span>
                      </div>

                      <div className="mt-3 space-y-1">
                        <div className="text-xs text-gray-500 dark:text-gray-400">総支出額:</div>
                        <div className="text-xl font-extrabold text-red-600 dark:text-red-400">
                          ¥{info.totalExpense.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between text-[11px] text-gray-400">
                      <span>最終利用日: {info.latestDate || 'なし'}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingCard(cardName);
                          setNewCardName(cardName === '未設定・その他' ? '' : cardName);
                        }}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                      >
                        名称変更
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rename Card Modal / Card */}
        {renamingCard && (
          <div className="p-6 bg-indigo-50/80 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-indigo-900 dark:text-indigo-300 flex items-center gap-2">
                <span>✏️</span> 「{renamingCard}」の名称一括変更
              </h3>
              <button
                type="button"
                onClick={() => setRenamingCard(null)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                キャンセル ✕
              </button>
            </div>

            <form onSubmit={handleRenameCardSubmit} className="flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                value={newCardName}
                onChange={(e) => setNewCardName(e.target.value)}
                placeholder="新しいカード名・支払い方法を入力 (例: 楽天カードメイン)"
                required
                className="flex-1 w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setRenamingCard(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow disabled:opacity-50"
                >
                  {isPending ? '変更中...' : '一括変更を実行'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Selected Card Details and Edit Table */}
        {selectedCard && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden space-y-4">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>💳</span> 「{selectedCard}」の利用明細・編集画面
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  全{cardTransactions.length}件の明細を日付順 (古い順) に表示中
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setRenamingCard(selectedCard);
                  setNewCardName(selectedCard === '未設定・その他' ? '' : selectedCard);
                }}
                className="text-xs px-3.5 py-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-xl font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition"
              >
                ✏️ このカード名を一括変更する
              </button>
            </div>

            {cardTransactions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                「{selectedCard}」の明細はありません。
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {cardTransactions.map((item) => {
                  const isEditing = editingItem?.id === item.id;
                  const categoryLabel = item.childCategory || item.parentCategory || 'その他';
                  const displayTitle = item.memo || item.note || item.location || categoryLabel;
                  const isIncome = item.type === '収入' || item.type === 'income';

                  if (isEditing) {
                    return (
                      <div key={item.id} className="p-6 bg-blue-50/50 dark:bg-gray-750">
                        <form onSubmit={handleUpdateTransaction} className="space-y-4">
                          <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                              明細編集 (ID: {item.id})
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditingItem(null)}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              キャンセル ✕
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">区分</label>
                              <select
                                name="type"
                                defaultValue={item.type}
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              >
                                <option value="支出">支出</option>
                                <option value="収入">収入</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">カテゴリ</label>
                              <input
                                type="text"
                                name="parentCategory"
                                defaultValue={item.parentCategory || ''}
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">カード・支払い方法</label>
                              <input
                                type="text"
                                name="paymentMethod"
                                defaultValue={item.paymentMethod || ''}
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">メモ</label>
                              <input
                                type="text"
                                name="memo"
                                defaultValue={item.memo || ''}
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">金額 (円)</label>
                              <input
                                type="number"
                                name="amount"
                                defaultValue={item.amount ?? ''}
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] text-gray-500 mb-1">日付</label>
                              <input
                                type="date"
                                name="date"
                                defaultValue={item.date}
                                required
                                className="w-full p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs"
                              />
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setEditingItem(null)}
                              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-medium hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              キャンセル
                            </button>
                            <button
                              type="submit"
                              disabled={isPending}
                              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow disabled:opacity-50"
                            >
                              {isPending ? '保存中...' : '更新を保存'}
                            </button>
                          </div>
                        </form>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="p-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition"
                    >
                      <div className="flex items-center gap-3 sm:gap-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
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
                            {item.date}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 sm:gap-4">
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
                          onClick={() => setEditingItem(item)}
                          disabled={isPending}
                          className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium p-1 rounded transition"
                        >
                          編集
                        </button>

                        <button
                          onClick={() => handleDeleteTransaction(item.id)}
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
        )}
      </main>
    </div>
  );
}
