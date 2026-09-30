'use client';

import { useState, useEffect, useTransition, useMemo } from 'react';
import { getTransactions, addTransaction, updateTransaction, deleteTransaction } from './actions';
import Navbar from '@/app/components/Navbar';
import { getMonthlyDateRange, formatDateJapanese } from '@/lib/date-utils';
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

  // Month navigation state
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(today.getMonth() + 1);

  // Month start/end configuration state
  const [settingMode, setSettingMode] = useState<'startDay' | 'precedingWeekday15' | 'custom'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedMode = localStorage.getItem('kakeibo_settingMode');
        if (savedMode === 'startDay' || savedMode === 'precedingWeekday15' || savedMode === 'nearestWeekday15' || savedMode === 'custom') {
          return 'precedingWeekday15';
        }
      } catch {
        // Ignore
      }
    }
    return 'precedingWeekday15';
  });

  const [monthStartDay, setMonthStartDay] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedStartDay = localStorage.getItem('kakeibo_monthStartDay');
        if (savedStartDay) {
          const parsed = parseInt(savedStartDay, 10);
          if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) {
            return parsed;
          }
        }
      } catch {
        // Ignore
      }
    }
    return 1;
  });

  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showPeriodSettings, setShowPeriodSettings] = useState<boolean>(false);

  // Filter modes
  const [showOnlyPeriodItems, setShowOnlyPeriodItems] = useState<boolean>(true);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');

  // Editing state
  const [editingItem, setEditingItem] = useState<TransactionWorkItem | null>(null);

  // Registration Form state
  const [type, setType] = useState<'支出' | '収入'>('支出');
  const [parentCategory, setParentCategory] = useState<string>(CATEGORIES['支出'][0]);
  const [isPending, startTransition] = useTransition();

  // Save settings when changed
  const handleStartDayChange = (day: number) => {
    setMonthStartDay(day);
    setSettingMode('startDay');
    try {
      localStorage.setItem('kakeibo_monthStartDay', String(day));
      localStorage.setItem('kakeibo_settingMode', 'startDay');
    } catch {
      // Ignore
    }
  };

  const handleSettingModeChange = (mode: 'startDay' | 'precedingWeekday15' | 'custom') => {
    setSettingMode(mode);
    try {
      localStorage.setItem('kakeibo_settingMode', mode);
    } catch {
      // Ignore
    }
  };

  // Compute calculated date range
  const computedRange = useMemo(() => {
    if (settingMode === 'custom' && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    if (settingMode === 'precedingWeekday15') {
      return getMonthlyDateRange(selectedYear, selectedMonth, 15, true);
    }
    return getMonthlyDateRange(selectedYear, selectedMonth, monthStartDay, false);
  }, [selectedYear, selectedMonth, monthStartDay, settingMode, customStartDate, customEndDate]);

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

  // Group unique payment methods / credit cards
  const uniquePaymentMethods = useMemo(() => {
    const methods = items
      .map((i) => i.paymentMethod?.trim())
      .filter((m): m is string => Boolean(m && m.length > 0));
    return Array.from(new Set(methods)).sort();
  }, [items]);

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth() + 1);
  };

  const handleTypeChange = (newType: '支出' | '収入') => {
    setType(newType);
    setParentCategory(CATEGORIES[newType][0]);
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
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

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingItem) return;
    setErrorMsg(null);
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const res = await updateTransaction(editingItem.id, formData);
      if (!res.success) {
        setErrorMsg(res.error || '更新に失敗しました');
      } else {
        setEditingItem(null);
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

  // Filter transactions by period
  const periodItems = useMemo(() => {
    return items.filter((item) => {
      if (!item.date) return false;
      return item.date >= computedRange.startDate && item.date <= computedRange.endDate;
    });
  }, [items, computedRange]);

  // Base list depending on showOnlyPeriodItems flag
  const baseItems = showOnlyPeriodItems ? periodItems : items;

  // Filtered by selected payment method
  const displayItems = useMemo(() => {
    if (selectedPaymentMethod === 'all') return baseItems;
    if (selectedPaymentMethod === 'none') return baseItems.filter((i) => !i.paymentMethod);
    return baseItems.filter((i) => i.paymentMethod === selectedPaymentMethod);
  }, [baseItems, selectedPaymentMethod]);

  // Aggregation for period (for all payment methods in period)
  const totalIncome = useMemo(() => {
    return periodItems
      .filter((i) => i.type === '収入' || i.type === 'income')
      .reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [periodItems]);

  const totalExpense = useMemo(() => {
    return periodItems
      .filter((i) => i.type === '支出' || i.type === 'expense')
      .reduce((sum, i) => sum + (i.amount || 0), 0);
  }, [periodItems]);

  const balance = totalIncome - totalExpense;

  // Category breakdowns for period
  const categoryExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    periodItems
      .filter((i) => i.type === '支出' || i.type === 'expense')
      .forEach((i) => {
        const cat = i.parentCategory || 'その他';
        map[cat] = (map[cat] || 0) + (i.amount || 0);
      });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodItems]);

  const categoryIncomes = useMemo(() => {
    const map: Record<string, number> = {};
    periodItems
      .filter((i) => i.type === '収入' || i.type === 'income')
      .forEach((i) => {
        const cat = i.parentCategory || 'その他';
        map[cat] = (map[cat] || 0) + (i.amount || 0);
      });

    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [periodItems]);

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      {/* Shared Datalist for Payment Methods */}
      <datalist id="payment-methods-list">
        {uniquePaymentMethods.map((pm) => (
          <option key={pm} value={pm} />
        ))}
      </datalist>

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Title Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">月別家計簿・集計</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              月ごとの収支の確認・分析・クレジットカード別管理を行えます。
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/import"
              className="text-xs bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-medium px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <span>📥</span>
              <span>CSV取込画面へ</span>
            </Link>

            <button
              onClick={() => setShowPeriodSettings(!showPeriodSettings)}
              className="text-xs bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 font-medium px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 shadow-sm"
            >
              <span>⚙️</span>
              <span>{showPeriodSettings ? '期間設定を閉じる' : '月の集計期間の設定'}</span>
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm flex justify-between items-center">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="font-bold">✕</button>
          </div>
        )}

        {/* Month Settings Drawer / Card */}
        {showPeriodSettings && (
          <div className="p-6 bg-blue-50/70 dark:bg-gray-800/80 border border-blue-200 dark:border-gray-700 rounded-2xl space-y-4 transition shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-blue-900 dark:text-blue-300 flex items-center gap-2">
                <span>🗓️</span> 月の始まり・終わり (締め日) の設定
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                給料日等に合わせた月集計範囲の設定
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Option 1: 15th Preceding Weekday */}
              <div
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  settingMode === 'precedingWeekday15'
                    ? 'bg-white dark:bg-gray-750 border-blue-500 shadow-sm'
                    : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => handleSettingModeChange('precedingWeekday15')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="settingMode"
                    checked={settingMode === 'precedingWeekday15'}
                    onChange={() => handleSettingModeChange('precedingWeekday15')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                    15日始まり (土日祝は直前の平日)
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                  毎月15日を開始日とします。15日が土曜日・日曜日・祝日の場合は、直前の平日に自動補正されます。
                </p>
              </div>

              {/* Option 2: Fixed Start Day */}
              <div
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  settingMode === 'startDay'
                    ? 'bg-white dark:bg-gray-750 border-blue-500 shadow-sm'
                    : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => handleSettingModeChange('startDay')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="settingMode"
                    checked={settingMode === 'startDay'}
                    onChange={() => handleSettingModeChange('startDay')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                    日付指定 (1日〜31日)
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 ml-6">
                  固定の日付から翌月前日までを集計範囲とします。
                </p>

                <div className="ml-6 flex flex-wrap items-center gap-2">
                  {[1, 10, 20, 25].map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartDayChange(day);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                        settingMode === 'startDay' && monthStartDay === day
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {day === 1 ? '1日' : `${day}日`}
                    </button>
                  ))}

                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={monthStartDay}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val)) handleStartDayChange(val);
                      }}
                      className="w-12 p-1 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-xs text-center"
                    />
                    <span className="text-[11px] text-gray-500">日</span>
                  </div>
                </div>
              </div>

              {/* Option 3: Custom Range */}
              <div
                className={`p-4 rounded-xl border cursor-pointer transition ${
                  settingMode === 'custom'
                    ? 'bg-white dark:bg-gray-750 border-blue-500 shadow-sm'
                    : 'bg-white/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                }`}
                onClick={() => handleSettingModeChange('custom')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    name="settingMode"
                    checked={settingMode === 'custom'}
                    onChange={() => handleSettingModeChange('custom')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm font-bold text-gray-800 dark:text-gray-200 cursor-pointer">
                    任意の日付範囲を個別指定
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 ml-6">
                  開始日と終了日を自由に選んで集計できます。
                </p>

                <div className="ml-6 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">開始日</label>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => {
                        setCustomStartDate(e.target.value);
                        handleSettingModeChange('custom');
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 mb-1">終了日</label>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => {
                        setCustomEndDate(e.target.value);
                        handleSettingModeChange('custom');
                      }}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Month Picker / Period Navigation Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left Month Switcher */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevMonth}
                className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-semibold transition"
                title="前月"
              >
                ← 前月
              </button>

              <div className="flex items-center gap-2 px-3 py-1 bg-gray-50 dark:bg-gray-750 rounded-xl border border-gray-200 dark:border-gray-700">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                  className="bg-transparent text-lg font-bold focus:outline-none cursor-pointer"
                >
                  {[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1, selectedYear + 2].map((y) => (
                    <option key={y} value={y} className="dark:bg-gray-800">
                      {y}年
                    </option>
                  ))}
                </select>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
                  className="bg-transparent text-lg font-bold text-blue-600 dark:text-blue-400 focus:outline-none cursor-pointer"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m} className="dark:bg-gray-800">
                      {m}月
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleNextMonth}
                className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-semibold transition"
                title="次月"
              >
                次月 →
              </button>

              <button
                onClick={handleCurrentMonth}
                className="px-3 py-2 rounded-xl text-xs font-medium border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                今月
              </button>
            </div>

            {/* Target Date Period Badge */}
            <div className="text-center sm:text-right">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold border border-blue-200 dark:border-blue-800/50">
                <span>📅 集計対象期間:</span>
                <span>
                  {formatDateJapanese(computedRange.startDate)} 〜 {formatDateJapanese(computedRange.endDate)}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Monthly Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>当月 総収入</span>
              <span className="p-1.5 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300 rounded-lg">
                💰
              </span>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-green-600 dark:text-green-400">
              ¥{totalIncome.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              対象期間内の収入合計
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>当月 総支出</span>
              <span className="p-1.5 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 rounded-lg">
                💸
              </span>
            </div>
            <div className="mt-3 text-3xl font-extrabold text-red-600 dark:text-red-400">
              ¥{totalExpense.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              対象期間内の支出合計
            </p>
          </div>

          <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <span>当月 収支バランス</span>
              <span className="p-1.5 bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 rounded-lg">
                ⚖️
              </span>
            </div>
            <div
              className={`mt-3 text-3xl font-extrabold ${
                balance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              ¥{balance.toLocaleString()}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {balance >= 0 ? '黒字' : '赤字'}
            </p>
          </div>
        </div>

        {/* Credit Card / Payment Method Filter Bar */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>💳</span> クレジットカード・支払い方法別の絞り込み
            </h2>
            {selectedPaymentMethod !== 'all' && (
              <button
                onClick={() => setSelectedPaymentMethod('all')}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                すべての支払い方法を表示に戻す
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedPaymentMethod('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition ${
                selectedPaymentMethod === 'all'
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              すべて ({baseItems.length}件)
            </button>

            {uniquePaymentMethods.map((pm) => {
              const cardCount = baseItems.filter((i) => i.paymentMethod === pm).length;
              const cardTotal = baseItems
                .filter((i) => i.paymentMethod === pm && (i.type === '支出' || i.type === 'expense'))
                .reduce((sum, i) => sum + (i.amount || 0), 0);

              return (
                <button
                  key={pm}
                  onClick={() => setSelectedPaymentMethod(pm)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
                    selectedPaymentMethod === pm
                      ? 'bg-indigo-600 text-white shadow'
                      : 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200/60 dark:border-indigo-800/40'
                  }`}
                >
                  <span>💳 {pm}</span>
                  <span className="opacity-80">({cardCount}件)</span>
                  <span className="font-bold">¥{cardTotal.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Category Breakdown Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>📊</span> カテゴリ別集計 (当月)
          </h2>

          {categoryExpenses.length === 0 && categoryIncomes.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              選択した対象期間のデータがありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Expense Breakdown */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center justify-between border-b pb-2 dark:border-gray-700">
                  <span>支出内訳</span>
                  <span>計 ¥{totalExpense.toLocaleString()}</span>
                </h3>

                {categoryExpenses.length === 0 ? (
                  <p className="text-xs text-gray-400">支出データなし</p>
                ) : (
                  <div className="space-y-3">
                    {categoryExpenses.map(([catName, amount]) => {
                      const pct = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
                      return (
                        <div key={catName} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-gray-700 dark:text-gray-300">{catName}</span>
                            <span className="font-bold">
                              ¥{amount.toLocaleString()} <span className="text-gray-400 font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-red-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Income Breakdown */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-green-600 dark:text-green-400 flex items-center justify-between border-b pb-2 dark:border-gray-700">
                  <span>収入内訳</span>
                  <span>計 ¥{totalIncome.toLocaleString()}</span>
                </h3>

                {categoryIncomes.length === 0 ? (
                  <p className="text-xs text-gray-400">収入データなし</p>
                ) : (
                  <div className="space-y-3">
                    {categoryIncomes.map(([catName, amount]) => {
                      const pct = totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0;
                      return (
                        <div key={catName} className="space-y-1">
                          <div className="flex justify-between text-xs font-medium">
                            <span className="text-gray-700 dark:text-gray-300">{catName}</span>
                            <span className="font-bold">
                              ¥{amount.toLocaleString()} <span className="text-gray-400 font-normal">({pct}%)</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Transaction Registration Form */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold mb-4">新規収支登録</h2>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                区分
              </label>
              <select
                name="type"
                value={type}
                onChange={(e) => handleTypeChange(e.target.value as '支出' | '収入')}
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="支出">支出</option>
                <option value="収入">収入</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                カテゴリー
              </label>
              <select
                name="parentCategory"
                value={parentCategory}
                onChange={(e) => setParentCategory(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                カード・支払い方法
              </label>
              <input
                type="text"
                name="paymentMethod"
                list="payment-methods-list"
                placeholder="例: 楽天カード"
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                メモ
              </label>
              <input
                type="text"
                name="memo"
                placeholder="例: スーパー"
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <div className="lg:col-span-6 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium p-2.5 rounded-xl transition text-sm shadow disabled:opacity-50"
              >
                {isPending ? '追加中...' : '登録する'}
              </button>
            </div>
          </form>
        </div>

        {/* Transactions List */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-bold">収支明細一覧</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {selectedPaymentMethod !== 'all' ? `「${selectedPaymentMethod}」の` : ''}
                {showOnlyPeriodItems ? '当月対象期間の明細を表示中' : '全期間の明細を表示中'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowOnlyPeriodItems(!showOnlyPeriodItems)}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 transition"
              >
                {showOnlyPeriodItems ? '全明細を表示する' : '当月のみに絞り込む'}
              </button>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
                {displayItems.length} 件
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : displayItems.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              該当する明細がありません。上のフォームから登録するか、CSV取込画面からデータを取り込んでください。
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {displayItems.map((item) => {
                const isEditing = editingItem?.id === item.id;
                const categoryLabel = item.childCategory || item.parentCategory || 'その他';
                const displayTitle = item.memo || item.note || item.location || categoryLabel;
                const isIncome = item.type === '収入' || item.type === 'income';

                if (isEditing) {
                  return (
                    <div key={item.id} className="p-6 bg-blue-50/50 dark:bg-gray-750">
                      <form onSubmit={handleUpdate} className="space-y-4">
                        <div className="flex items-center justify-between border-b pb-2 dark:border-gray-700">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                            明細の編集 (ID: {item.id})
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
                              list="payment-methods-list"
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
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex items-center gap-2">
                          <span>{item.date}</span>
                          {item.paymentMethod && (
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 rounded font-medium text-[11px]">
                              💳 {item.paymentMethod}
                            </span>
                          )}
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
      </main>
    </div>
  );
}
