'use client';

import { useState, useEffect, useTransition, useMemo, useSyncExternalStore } from 'react';
import Navbar from '@/app/components/Navbar';
import {
  getTransactions,
  updateTransaction,
  deleteTransaction,
  updatePaymentMethodName,
  getCardSettingsFromDb,
  upsertCardSettingInDb,
} from '@/app/dashboard/actions';
import Link from 'next/link';
import {
  CardSetting,
  DEFAULT_CARD_SETTING,
  getPaymentInfoForTransaction,
  getBillingCycleForPaymentMonth,
} from '@/lib/card-settings';

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

const CARD_SETTINGS_STORAGE_KEY = 'kakeibo_card_settings_v1';

// Custom store for Card Settings in LocalStorage
function subscribeCardSettings(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('kakeibo_card_settings_change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('kakeibo_card_settings_change', callback);
  };
}

const EMPTY_CARD_SETTINGS_MAP: Record<string, Omit<CardSetting, 'cardName'>> = {};
let cachedCardSettingsRaw: string | null = null;
let cachedCardSettingsMap: Record<string, Omit<CardSetting, 'cardName'>> = EMPTY_CARD_SETTINGS_MAP;

function getCardSettingsSnapshot(): Record<string, Omit<CardSetting, 'cardName'>> {
  if (typeof window === 'undefined') return EMPTY_CARD_SETTINGS_MAP;
  try {
    const raw = localStorage.getItem(CARD_SETTINGS_STORAGE_KEY);
    if (raw === cachedCardSettingsRaw) {
      return cachedCardSettingsMap;
    }
    cachedCardSettingsRaw = raw;
    cachedCardSettingsMap = raw ? JSON.parse(raw) : EMPTY_CARD_SETTINGS_MAP;
    return cachedCardSettingsMap;
  } catch {
    return EMPTY_CARD_SETTINGS_MAP;
  }
}

function getServerCardSettingsSnapshot(): Record<string, Omit<CardSetting, 'cardName'>> {
  return EMPTY_CARD_SETTINGS_MAP;
}

export default function CardsPage() {
  const cardSettingsLocalStorageMap = useSyncExternalStore(
    subscribeCardSettings,
    getCardSettingsSnapshot,
    getServerCardSettingsSnapshot
  );

  const [dbCardSettings, setDbCardSettings] = useState<Record<string, Omit<CardSetting, 'cardName'>>>({});
  const [dbErrorWarning, setDbErrorWarning] = useState<string | null>(null);

  const cardSettingsMap = useMemo(() => {
    return { ...cardSettingsLocalStorageMap, ...dbCardSettings };
  }, [cardSettingsLocalStorageMap, dbCardSettings]);

  const saveCardSetting = async (cardName: string, setting: Omit<CardSetting, 'cardName'>) => {
    // 1. Save to LocalStorage as instant local cache
    const updatedLocal = { ...cardSettingsMap, [cardName]: setting };
    localStorage.setItem(CARD_SETTINGS_STORAGE_KEY, JSON.stringify(updatedLocal));
    window.dispatchEvent(new Event('kakeibo_card_settings_change'));

    // 2. Save to Database via Server Action
    setDbCardSettings((prev) => ({ ...prev, [cardName]: setting }));
    const res = await upsertCardSettingInDb(cardName, setting);
    if (!res.success) {
      console.warn('DB upsert card setting warning:', res.error);
      setDbErrorWarning('※ DBテーブル未作成等の理由によりローカルストレージへ保存しました（SQLの実行でDB保存可能になります）。');
    } else {
      setDbErrorWarning(null);
    }
  };

  const [items, setItems] = useState<TransactionWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedCardState, setSelectedCardState] = useState<string | null>(null);
  const [renamingCard, setRenamingCard] = useState<string | null>(null);
  const [newCardName, setNewCardName] = useState<string>('');

  const [editingItem, setEditingItem] = useState<TransactionWorkItem | null>(null);
  const [isPending, startTransition] = useTransition();

  // Target Payment Month state (e.g. "2026-03")
  const todayStr = new Date().toISOString().slice(0, 7);
  const [selectedPaymentMonth, setSelectedPaymentMonth] = useState<string>(todayStr);

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

    Promise.all([getTransactions(), getCardSettingsFromDb()]).then(([txRes, settingsRes]) => {
      if (!ignore) {
        if (txRes.error) {
          setErrorMsg(txRes.error);
        } else {
          setItems(txRes.data as TransactionWorkItem[]);
        }

        if (settingsRes.data && settingsRes.data.length > 0) {
          const map: Record<string, Omit<CardSetting, 'cardName'>> = {};
          settingsRes.data.forEach((row) => {
            map[row.cardName] = {
              isCreditCard: row.isCreditCard ?? true,
              closingDay: row.closingDay,
              paymentMonthOffset: row.paymentMonthOffset,
              paymentDay: row.paymentDay,
            };
          });
          setDbCardSettings(map);
        }
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, []);

  // Summary per payment method / credit card calculated for selected payment month
  const cardsSummary = useMemo(() => {
    const map: Record<
      string,
      {
        count: number;
        totalExpense: number;
        monthlyExpense: number;
        latestDate: string;
        paymentDate: string;
        billingCycleStart: string;
        billingCycleEnd: string;
        isCc: boolean;
      }
    > = {};

    items.forEach((item) => {
      const pm = item.paymentMethod?.trim() || '未設定・その他';
      if (!map[pm]) {
        const setting = cardSettingsMap[pm] || DEFAULT_CARD_SETTING;
        const cycle = getBillingCycleForPaymentMonth(selectedPaymentMonth, setting);
        const isCc = setting.isCreditCard ?? true;

        map[pm] = {
          count: 0,
          totalExpense: 0,
          monthlyExpense: 0,
          latestDate: '',
          paymentDate: cycle.paymentDate,
          billingCycleStart: cycle.billingCycleStart,
          billingCycleEnd: cycle.billingCycleEnd,
          isCc,
        };
      }

      map[pm].count += 1;
      const isExpense = item.type === '支出' || item.type === 'expense';
      if (isExpense) {
        map[pm].totalExpense += item.amount || 0;
      }

      if (!map[pm].latestDate || (item.date && item.date > map[pm].latestDate)) {
        map[pm].latestDate = item.date;
      }

      // Compute monthly billed amount for selected payment month
      const setting = cardSettingsMap[pm] || DEFAULT_CARD_SETTING;
      const isCc = setting.isCreditCard ?? true;
      if (isExpense) {
        if (!isCc) {
          if (item.date && item.date.startsWith(selectedPaymentMonth)) {
            map[pm].monthlyExpense += item.amount || 0;
          }
        } else {
          const { paymentMonth } = getPaymentInfoForTransaction(item.date, setting);
          if (paymentMonth === selectedPaymentMonth) {
            map[pm].monthlyExpense += item.amount || 0;
          }
        }
      }
    });

    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  }, [items, cardSettingsMap, selectedPaymentMonth]);

  // Global total withdrawal for selected payment month across all payment methods
  const globalMonthlyTotalExpense = useMemo(() => {
    return cardsSummary.reduce((sum, [, info]) => sum + info.monthlyExpense, 0);
  }, [cardsSummary]);

  const selectedCard = selectedCardState ?? (cardsSummary.length > 0 ? cardsSummary[0][0] : '');
  const setSelectedCard = (card: string) => setSelectedCardState(card);

  // Settings for the selected card
  const currentCardSetting: Omit<CardSetting, 'cardName'> = useMemo(() => {
    if (!selectedCard) return DEFAULT_CARD_SETTING;
    return cardSettingsMap[selectedCard] || DEFAULT_CARD_SETTING;
  }, [cardSettingsMap, selectedCard]);

  // Billing cycle info for selected card and payment month
  const currentBillingCycle = useMemo(() => {
    return getBillingCycleForPaymentMonth(selectedPaymentMonth, currentCardSetting);
  }, [selectedPaymentMonth, currentCardSetting]);

  // Card transactions falling in the current billing cycle for selected payment month
  const monthlyBilledTransactions = useMemo(() => {
    if (!selectedCard) return [];
    if (!(currentCardSetting.isCreditCard ?? true)) {
      return items
        .filter((item) => {
          const pm = item.paymentMethod?.trim() || '未設定・その他';
          if (pm !== selectedCard) return false;
          return item.date && item.date.startsWith(selectedPaymentMonth);
        })
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    }
    if (!currentBillingCycle.billingCycleStart || !currentBillingCycle.billingCycleEnd) {
      return [];
    }
    return items
      .filter((item) => {
        const pm = item.paymentMethod?.trim() || '未設定・その他';
        if (pm !== selectedCard) return false;
        const { paymentMonth } = getPaymentInfoForTransaction(item.date, currentCardSetting);
        return paymentMonth === selectedPaymentMonth;
      })
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [items, selectedCard, currentCardSetting, selectedPaymentMonth, currentBillingCycle]);

  // Total billed amount for selected month
  const totalMonthlyBilledAmount = useMemo(() => {
    return monthlyBilledTransactions.reduce((acc, i) => {
      if (i.type === '支出' || i.type === 'expense') {
        return acc + (i.amount || 0);
      }
      return acc;
    }, 0);
  }, [monthlyBilledTransactions]);

  // All transactions for selected card (unfiltered by month)
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
        // Move card settings if renamed
        if (cardSettingsMap[renamingCard]) {
          saveCardSetting(newCardName.trim(), cardSettingsMap[renamingCard]);
        }
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

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = selectedPaymentMonth.split('-').map(Number);
    const date = new Date(y, m - 2, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedPaymentMonth(newMonth);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedPaymentMonth.split('-').map(Number);
    const date = new Date(y, m, 1);
    const newMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    setSelectedPaymentMonth(newMonth);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Header with Global Payment Month Picker */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">クレジットカード・支払い方法管理</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              引き落とし日・締め日基準での月別支払い額と各カード請求明細を管理できます。
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Payment Month Picker */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-300 dark:border-gray-600 shadow-sm">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="px-2.5 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition font-bold"
              >
                ← 前月
              </button>
              <input
                type="month"
                value={selectedPaymentMonth}
                onChange={(e) => e.target.value && setSelectedPaymentMonth(e.target.value)}
                className="bg-transparent font-extrabold text-sm px-1 py-0.5 border-none focus:outline-none text-blue-600 dark:text-blue-400"
              />
              <button
                type="button"
                onClick={handleNextMonth}
                className="px-2.5 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition font-bold"
              >
                次月 →
              </button>
            </div>

            <Link
              href="/dashboard"
              className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 px-3.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition"
            >
              ← 月別集計画面へ
            </Link>
          </div>
        </div>

        {/* Global Monthly Summary Card */}
        <div className="p-5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-2xl text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-blue-100 font-semibold tracking-wider uppercase">
              {selectedPaymentMonth.replace('-', '年')}月 引き落とし・出金 総予定額
            </div>
            <div className="text-xs text-blue-200 mt-1">
              ※各クレジットカードの締め日・引き落とし日設定に基づき自動算出
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              ¥{globalMonthlyTotalExpense.toLocaleString()}
            </div>
          </div>
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

        {dbErrorWarning && (
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-xl text-xs flex justify-between items-center">
            <span>{dbErrorWarning}</span>
            <button onClick={() => setDbErrorWarning(null)} className="font-bold ml-2">✕</button>
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
                const setting = cardSettingsMap[cardName] || DEFAULT_CARD_SETTING;
                const isCc = setting.isCreditCard ?? true;

                const closingText = setting.closingDay === 0 ? '月末' : `${setting.closingDay}日`;
                const payOffsetLabel = setting.paymentMonthOffset === 0 ? '当月' : setting.paymentMonthOffset === 1 ? '翌月' : '翌々月';
                const payDayText = setting.paymentDay === 0 ? '月末' : `${setting.paymentDay}日`;

                const icon = isCc ? '💳' : cardName.includes('銀行') ? '🏦' : '💵';

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
                          <span>{icon}</span>
                          <span>{cardName}</span>
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 font-semibold text-gray-600 dark:text-gray-300">
                          {info.count}件
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                        {isCc ? (
                          <>
                            <div>締め日: <span className="font-semibold text-gray-700 dark:text-gray-300">{closingText}</span></div>
                            <div>引き落とし日: <span className="font-semibold text-blue-600 dark:text-blue-400">{info.paymentDate || `${payOffsetLabel}${payDayText}`}</span></div>
                            <div className="text-[10px] text-gray-400">対象期間: {info.billingCycleStart} 〜 {info.billingCycleEnd}</div>
                          </>
                        ) : (
                          <div className="text-blue-600 dark:text-blue-400 font-semibold">
                            即時決済 (銀行口座・現金等)
                          </div>
                        )}
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 space-y-1">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold flex justify-between">
                          <span>{selectedPaymentMonth.replace('-', '年')}月 引き落とし予定:</span>
                        </div>
                        <div className="text-xl font-extrabold text-red-600 dark:text-red-400">
                          ¥{info.monthlyExpense.toLocaleString()}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          (累計支出: ¥{info.totalExpense.toLocaleString()})
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

        {/* Card Settings & Monthly Payment Management Section */}
        {selectedCard && (
          <div className="space-y-6">
            {/* 1. Card Settings Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <span>⚙️</span> 「{selectedCard}」の支払い種別・締め日設定
                </h2>
                <span className="text-xs text-gray-400">※支払い方法ごとに個別設定</span>
              </div>

              <div className="space-y-4 text-xs">
                {/* Type Selection: Credit Card vs Bank Account / Cash */}
                <div>
                  <label className="block text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                    支払い方法の種別
                  </label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`isCreditCard_${selectedCard}`}
                        checked={currentCardSetting.isCreditCard ?? true}
                        onChange={() => saveCardSetting(selectedCard, { ...currentCardSetting, isCreditCard: true })}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-sm">💳 クレジットカード (後払い・締め日あり)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`isCreditCard_${selectedCard}`}
                        checked={!(currentCardSetting.isCreditCard ?? true)}
                        onChange={() => saveCardSetting(selectedCard, { ...currentCardSetting, isCreditCard: false })}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-bold text-sm">🏦 銀行口座・現金・即時決済</span>
                    </label>
                  </div>
                </div>

                {/* Conditional Controls for Credit Card */}
                {currentCardSetting.isCreditCard ?? true ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div>
                      <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">締め日</label>
                      <select
                        value={currentCardSetting.closingDay}
                        onChange={(e) => saveCardSetting(selectedCard, { ...currentCardSetting, closingDay: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-semibold"
                      >
                        <option value={5}>毎月 5日</option>
                        <option value={10}>毎月 10日</option>
                        <option value={15}>毎月 15日 (標準)</option>
                        <option value={20}>毎月 20日</option>
                        <option value={25}>毎月 25日</option>
                        <option value={0}>毎月 末日</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">引き落とし月</label>
                      <select
                        value={currentCardSetting.paymentMonthOffset}
                        onChange={(e) => saveCardSetting(selectedCard, { ...currentCardSetting, paymentMonthOffset: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-semibold"
                      >
                        <option value={0}>当月</option>
                        <option value={1}>翌月 (標準)</option>
                        <option value={2}>翌々月</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-gray-500 dark:text-gray-400 mb-1 font-medium">
                        引き落とし日 <span className="text-[10px] text-gray-400">(1〜31日 または 0=末日)</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={31}
                          value={currentCardSetting.paymentDay}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(31, Number(e.target.value) || 0));
                            saveCardSetting(selectedCard, { ...currentCardSetting, paymentDay: val });
                          }}
                          className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                          placeholder="例: 10 (0=末日)"
                        />
                        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap">
                          {currentCardSetting.paymentDay === 0 ? '末日' : '日'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-xl text-xs">
                    💡 銀行口座や現金などは即時引き落とし・即時決済のため、後払いの締め日・引き落とし日計算は適用されません。明細は利用日（出金日）基準で直接集計されます。
                  </div>
                )}
              </div>
            </div>

            {/* 2. Monthly Payment Schedule & Billed Amount */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <span>📅</span> 「{selectedCard}」の月毎支払い（引き落とし）管理
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      設定した締め日と引き落とし日に基づき、各月の引き落とし予定額と対象利用明細を自動集計します。
                    </p>
                  </div>

                  {/* Payment Month Picker */}
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-750 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="px-2.5 py-1 text-xs hover:bg-white dark:hover:bg-gray-700 rounded-lg transition font-bold"
                    >
                      ← 前月
                    </button>
                    <input
                      type="month"
                      value={selectedPaymentMonth}
                      onChange={(e) => e.target.value && setSelectedPaymentMonth(e.target.value)}
                      className="bg-transparent font-bold text-sm px-1 py-0.5 border-none focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="px-2.5 py-1 text-xs hover:bg-white dark:hover:bg-gray-700 rounded-lg transition font-bold"
                    >
                      次月 →
                    </button>
                  </div>
                </div>

                {/* Billed Summary Banner */}
                <div className="p-4 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow">
                  <div>
                    <div className="text-xs text-blue-100 font-medium">
                      {selectedPaymentMonth.replace('-', '年')}月 引き落とし予定（対象利用期間: {currentBillingCycle.billingCycleStart} 〜 {currentBillingCycle.billingCycleEnd}）
                    </div>
                    <div className="text-xs text-blue-200 mt-0.5">
                      引き落とし予定日: <span className="font-bold text-white underline decoration-blue-300">{currentBillingCycle.paymentDate}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-blue-100 text-left sm:text-right">引き落とし合計金額</div>
                    <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                      ¥{totalMonthlyBilledAmount.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Monthly Itemized Transactions List */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                <div className="p-4 bg-gray-50 dark:bg-gray-750/50 text-xs font-bold text-gray-500 dark:text-gray-400 flex justify-between items-center">
                  <span>対象月利用明細 ({monthlyBilledTransactions.length}件)</span>
                  <span>締め日基準抽出</span>
                </div>

                {monthlyBilledTransactions.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    {selectedPaymentMonth.replace('-', '年')}月引き落とし対象の利用明細はありません。
                  </div>
                ) : (
                  monthlyBilledTransactions.map((item) => {
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
                            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              isIncome
                                ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                            }`}
                          >
                            {categoryLabel}
                          </span>
                          <div>
                            <div className="font-semibold text-sm sm:text-base">{displayTitle}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                              利用日: {item.date}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4">
                          <span
                            className={`font-bold text-sm sm:text-lg ${
                              isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {isIncome ? '+' : '-'}¥{(item.amount || 0).toLocaleString()}
                          </span>

                          <button
                            onClick={() => setEditingItem(item)}
                            disabled={isPending}
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium p-1 rounded transition"
                          >
                            編集
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 3. All Transactions Edit Table for selected card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden space-y-4">
              <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <span>📋</span> 「{selectedCard}」の全登録明細・編集
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    全{cardTransactions.length}件の明細を一覧表示・編集・削除できます
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
                            <div className="font-semibold text-sm sm:text-base">{displayTitle}</div>
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{item.date}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:gap-4">
                          <span
                            className={`font-bold text-sm sm:text-lg ${
                              isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {isIncome ? '+' : '-'}¥{(item.amount || 0).toLocaleString()}
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
          </div>
        )}
      </main>
    </div>
  );
}
