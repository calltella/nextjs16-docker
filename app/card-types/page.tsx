'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  getCardTypes,
  addCardType,
  updateCardType,
  deleteCardType,
  syncCardTypesFromTransactions,
  CardTypeItem,
} from './actions';
import Link from 'next/link';

export default function CardTypesPage() {
  const [items, setItems] = useState<CardTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingPaymentMethod, setEditingPaymentMethod] = useState('');
  const [editingNote, setEditingNote] = useState('');

  const [isPending, startTransition] = useTransition();

  const loadData = async () => {
    const res = await getCardTypes();
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setItems(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    let ignore = false;
    getCardTypes().then((res) => {
      if (!ignore) {
        if (res.error) {
          setErrorMsg(res.error);
        } else {
          setItems(res.data);
        }
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      const res = await addCardType(formData);
      if (!res.success) {
        setErrorMsg(res.error || '追加に失敗しました');
      } else {
        setSuccessMsg('カード種類を登録しました');
        form.reset();
        await loadData();
      }
    });
  };

  const handleSync = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await syncCardTypesFromTransactions();
      if (!res.success) {
        setErrorMsg(res.error || '同期に失敗しました');
      } else {
        setSuccessMsg(res.message || '同期が完了しました');
        await loadData();
      }
    });
  };

  const startEdit = (item: CardTypeItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
    setEditingPaymentMethod(item.paymentMethod || '');
    setEditingNote(item.note || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingPaymentMethod('');
    setEditingNote('');
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateCardType(id, formData);
      if (!res.success) {
        setErrorMsg(res.error || '更新に失敗しました');
      } else {
        setSuccessMsg('カード種類を更新しました');
        cancelEdit();
        await loadData();
      }
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const res = await deleteCardType(id);
      if (!res.success) {
        setErrorMsg(res.error || '削除に失敗しました');
      } else {
        setSuccessMsg('カード種類を削除しました');
        await loadData();
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">カード種類管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              取り込んだ payment_method カラムを参照し、カード種類の参照・変更・修正・削除を行います
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              ← ダッシュボード
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

        {/* Sync Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-lg font-bold mb-1">取り込んだ payment_method から一括同期</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              取引履歴 (transactions_work / transactions) 内の未登録 payment_method を自動抽出してカード種類へ追加します。
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={isPending}
            className="whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg transition text-sm disabled:opacity-50"
          >
            {isPending ? '同期中...' : 'payment_method から同期'}
          </button>
        </div>

        {/* Add Card Type Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold mb-4">新規カード種類の登録</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                カード種類名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                placeholder="例: 楽天カード, 三井住友カード"
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                参照 payment_method
              </label>
              <input
                type="text"
                name="paymentMethod"
                placeholder="例: 楽天カード"
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                備考・メモ
              </label>
              <input
                type="text"
                name="note"
                placeholder="例: メインカード"
                className="w-full p-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition text-sm disabled:opacity-50"
              >
                {isPending ? '登録中...' : '登録する'}
              </button>
            </div>
          </form>
        </div>

        {/* Card Types List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <h2 className="text-lg font-bold">登録済みカード種類一覧</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              全 {items.length} 件
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              カード種類がありません。「payment_method から同期」または上のフォームから手動登録してください。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-gray-700 dark:text-gray-300">
                <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="py-3 px-6">カード種類名</th>
                    <th className="py-3 px-6">参照 payment_method</th>
                    <th className="py-3 px-6">備考</th>
                    <th className="py-3 px-6 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((item) => {
                    const isEditing = editingId === item.id;

                    if (isEditing) {
                      return (
                        <tr key={item.id} className="bg-blue-50/50 dark:bg-blue-900/20">
                          <td colSpan={4} className="p-4">
                            <form
                              onSubmit={(e) => handleUpdate(e, item.id)}
                              className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center"
                            >
                              <div>
                                <label className="block text-xs font-semibold mb-1">
                                  カード種類名 <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  name="name"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  required
                                  className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">
                                  参照 payment_method
                                </label>
                                <input
                                  type="text"
                                  name="paymentMethod"
                                  value={editingPaymentMethod}
                                  onChange={(e) => setEditingPaymentMethod(e.target.value)}
                                  className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold mb-1">
                                  備考
                                </label>
                                <input
                                  type="text"
                                  name="note"
                                  value={editingNote}
                                  onChange={(e) => setEditingNote(e.target.value)}
                                  className="w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={isPending}
                                  className="px-3 py-1.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-300 transition"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="submit"
                                  disabled={isPending}
                                  className="px-3 py-1.5 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 transition"
                                >
                                  保存
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                        <td className="py-4 px-6 font-semibold text-gray-900 dark:text-gray-100">
                          {item.name}
                        </td>
                        <td className="py-4 px-6 text-gray-600 dark:text-gray-300">
                          {item.paymentMethod ? (
                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs">
                              {item.paymentMethod}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-gray-500 dark:text-gray-400">
                          {item.note || '-'}
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap space-x-2">
                          <button
                            onClick={() => startEdit(item)}
                            disabled={isPending}
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.name)}
                            disabled={isPending}
                            className="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium transition"
                          >
                            削除
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
