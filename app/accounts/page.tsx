'use client';

import { useState, useEffect, useTransition, useMemo, useSyncExternalStore } from 'react';
import Navbar from '@/app/components/Navbar';
import {
  getBankAccounts,
  addBankAccount,
  getBankBalances,
  addBankBalanceRecord,
  deleteBankBalanceRecord,
  getPaymentMethodsCategorized,
} from '@/app/dashboard/actions';
import { normalizeName } from '@/lib/string-utils';

interface BankAccountItem {
  id: number;
  userId: string;
  accountName: string;
  bankName?: string | null;
  accountNumber?: string | null;
  createdAt: Date | string;
}

interface BankBalanceItem {
  id: number;
  userId: string;
  accountName: string;
  recordDate: string;
  balance: number;
  memo?: string | null;
  createdAt: Date | string;
}

interface PaymentMethodItem {
  id: number;
  name: string;
  type: string; // 'credit_card', 'bank_account', 'cash', 'other'
}

const ACCOUNTS_STORAGE_KEY = 'kakeibo_bank_accounts_v1';
const BALANCES_STORAGE_KEY = 'kakeibo_bank_balances_v1';

function subscribeLocalStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('kakeibo_accounts_change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('kakeibo_accounts_change', callback);
  };
}

let cachedAccountsRaw: string | null = null;
let cachedAccountsList: BankAccountItem[] = [];
function getAccountsSnapshot(): BankAccountItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (raw === cachedAccountsRaw) return cachedAccountsList;
    cachedAccountsRaw = raw;
    cachedAccountsList = raw ? JSON.parse(raw) : [];
    return cachedAccountsList;
  } catch {
    return [];
  }
}

let cachedBalancesRaw: string | null = null;
let cachedBalancesList: BankBalanceItem[] = [];
function getBalancesSnapshot(): BankBalanceItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BALANCES_STORAGE_KEY);
    if (raw === cachedBalancesRaw) return cachedBalancesList;
    cachedBalancesRaw = raw;
    cachedBalancesList = raw ? JSON.parse(raw) : [];
    return cachedBalancesList;
  } catch {
    return [];
  }
}

const EMPTY_LIST: unknown[] = [];
function getServerSnapshot() {
  return EMPTY_LIST;
}

export default function BankAccountsPage() {
  const localAccounts = useSyncExternalStore(subscribeLocalStorage, getAccountsSnapshot, getServerSnapshot) as BankAccountItem[];
  const localBalances = useSyncExternalStore(subscribeLocalStorage, getBalancesSnapshot, getServerSnapshot) as BankBalanceItem[];

  const [dbAccounts, setDbAccounts] = useState<BankAccountItem[]>([]);
  const [dbBalances, setDbBalances] = useState<BankBalanceItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedAccountName, setSelectedAccountName] = useState<string | null>(null);

  // New account form state
  const [newAccountName, setNewAccountName] = useState('');
  const [newBankName, setNewBankName] = useState('');
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);

  // New balance record form state
  const todayStr = new Date().toISOString().split('T')[0];
  const [recordDate, setRecordDate] = useState(todayStr);
  const [balanceAmount, setBalanceAmount] = useState<string>('');
  const [memo, setMemo] = useState('');

  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let ignore = false;
    Promise.all([getBankAccounts(), getBankBalances(), getPaymentMethodsCategorized()]).then(([accRes, balRes, pmRes]) => {
      if (!ignore) {
        if (accRes.data) {
          setDbAccounts(accRes.data as BankAccountItem[]);
        }
        if (balRes.data) {
          setDbBalances(balRes.data as BankBalanceItem[]);
        }
        if (pmRes.data) {
          setPaymentMethods(pmRes.data as PaymentMethodItem[]);
        }
        setLoading(false);
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const refreshDbData = async () => {
    const [accRes, balRes, pmRes] = await Promise.all([getBankAccounts(), getBankBalances(), getPaymentMethodsCategorized()]);
    if (accRes.data) {
      setDbAccounts(accRes.data as BankAccountItem[]);
    }
    if (balRes.data) {
      setDbBalances(balRes.data as BankBalanceItem[]);
    }
    if (pmRes.data) {
      setPaymentMethods(pmRes.data as PaymentMethodItem[]);
    }
  };

  // Merge local & db with normalized account names
  const accounts = useMemo(() => {
    const map = new Map<string, BankAccountItem>();
    localAccounts.forEach((acc) => map.set(normalizeName(acc.accountName), { ...acc, accountName: normalizeName(acc.accountName) }));
    dbAccounts.forEach((acc) => map.set(normalizeName(acc.accountName), { ...acc, accountName: normalizeName(acc.accountName) }));
    return Array.from(map.values());
  }, [localAccounts, dbAccounts]);

  const balances = useMemo(() => {
    const map = new Map<string, BankBalanceItem>();
    localBalances.forEach((b) => {
      const normName = normalizeName(b.accountName);
      map.set(`${normName}_${b.recordDate}_${b.balance}`, { ...b, accountName: normName });
    });
    dbBalances.forEach((b) => {
      const normName = normalizeName(b.accountName);
      map.set(`${normName}_${b.recordDate}_${b.balance}`, { ...b, accountName: normName });
    });
    return Array.from(map.values());
  }, [localBalances, dbBalances]);

  // Group payment methods by type ('credit_card', 'bank_account', 'cash', 'other')
  const categorizedPaymentMethods = useMemo(() => {
    const creditCardsMap = new Map<string, PaymentMethodItem>();
    const bankAccountsMap = new Map<string, PaymentMethodItem>();
    const cashMap = new Map<string, PaymentMethodItem>();
    const otherMap = new Map<string, PaymentMethodItem>();

    paymentMethods.forEach((pm) => {
      const normName = normalizeName(pm.name);
      const item = { ...pm, name: normName };

      if (pm.type === 'credit_card') {
        creditCardsMap.set(normName, item);
      } else if (pm.type === 'bank_account') {
        bankAccountsMap.set(normName, item);
      } else if (pm.type === 'cash') {
        cashMap.set(normName, item);
      } else {
        otherMap.set(normName, item);
      }
    });

    return {
      creditCards: Array.from(creditCardsMap.values()),
      bankAccountsList: Array.from(bankAccountsMap.values()),
      cashList: Array.from(cashMap.values()),
      otherList: Array.from(otherMap.values()),
    };
  }, [paymentMethods]);

  // Compute latest balance for each account
  const accountLatestBalances = useMemo(() => {
    const map: Record<string, { latestBalance: number; latestDate: string }> = {};

    balances.forEach((item) => {
      const normName = normalizeName(item.accountName);
      if (
        !map[normName] ||
        item.recordDate > map[normName].latestDate
      ) {
        map[normName] = {
          latestBalance: item.balance,
          latestDate: item.recordDate,
        };
      }
    });

    return map;
  }, [balances]);

  // Combined accounts list (from bank_accounts or balance records or payment_methods of type bank_account)
  const allAccountNames = useMemo(() => {
    const namesSet = new Set<string>();
    accounts.forEach((acc) => namesSet.add(normalizeName(acc.accountName)));
    balances.forEach((bal) => namesSet.add(normalizeName(bal.accountName)));
    categorizedPaymentMethods.bankAccountsList.forEach((pm) => namesSet.add(normalizeName(pm.name)));
    return Array.from(namesSet);
  }, [accounts, balances, categorizedPaymentMethods]);

  const activeAccount = selectedAccountName || (allAccountNames.length > 0 ? allAccountNames[0] : '');

  // Balance history for active account
  const activeAccountBalances = useMemo(() => {
    if (!activeAccount) return [];
    const normActive = normalizeName(activeAccount);
    return balances
      .filter((b) => normalizeName(b.accountName) === normActive)
      .sort((a, b) => b.recordDate.localeCompare(a.recordDate));
  }, [balances, activeAccount]);

  // Add Bank Account submit handler
  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountName.trim()) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const name = newAccountName.trim();
    const bName = newBankName.trim() || undefined;

    // 1. Save to Local Storage immediately
    const newAccItem: BankAccountItem = {
      id: Date.now(),
      userId: 'local',
      accountName: name,
      bankName: bName,
      createdAt: new Date().toISOString(),
    };
    const updatedLocal = [...localAccounts, newAccItem];
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedLocal));
      window.dispatchEvent(new Event('kakeibo_accounts_change'));
    } catch {
      // ignore
    }

    setSuccessMsg(`「${name}」を銀行口座として追加登録しました`);
    setSelectedAccountName(name);
    setNewAccountName('');
    setNewBankName('');
    setShowAddAccountModal(false);

    // 2. Sync to DB via Server Action
    startTransition(async () => {
      await addBankAccount(name, bName);
      await refreshDbData();
    });
  };

  // Add Balance Snapshot submit handler
  const handleAddBalanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeAccount) {
      setErrorMsg('対象の銀行口座を選択してください');
      return;
    }
    const parsedAmount = parseInt(balanceAmount, 10);
    if (isNaN(parsedAmount)) {
      setErrorMsg('有効な残高金額を入力してください');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Save to Local Storage immediately
    const newBalItem: BankBalanceItem = {
      id: Date.now(),
      userId: 'local',
      accountName: activeAccount,
      recordDate,
      balance: parsedAmount,
      memo: memo.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const updatedLocal = [...localBalances, newBalItem];
    try {
      localStorage.setItem(BALANCES_STORAGE_KEY, JSON.stringify(updatedLocal));
      window.dispatchEvent(new Event('kakeibo_accounts_change'));
    } catch {
      // ignore
    }

    setSuccessMsg(`「${activeAccount}」の現在残高（¥${parsedAmount.toLocaleString()}）を記録しました`);
    setBalanceAmount('');
    setMemo('');

    // 2. Sync to DB via Server Action
    startTransition(async () => {
      await addBankBalanceRecord(
        activeAccount,
        parsedAmount,
        recordDate,
        memo.trim() || undefined
      );
      await refreshDbData();
    });
  };

  // Delete Balance Record handler
  const handleDeleteBalanceRecord = async (id: number) => {
    if (!confirm('この残高記録を削除しますか？')) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    // Delete local
    const updatedLocal = localBalances.filter((b) => b.id !== id);
    try {
      localStorage.setItem(BALANCES_STORAGE_KEY, JSON.stringify(updatedLocal));
      window.dispatchEvent(new Event('kakeibo_accounts_change'));
    } catch {
      // ignore
    }

    startTransition(async () => {
      await deleteBankBalanceRecord(id);
      setSuccessMsg('残高記録を削除しました');
      await refreshDbData();
    });
  };

  // Total current balance across all bank accounts
  const totalAssetsBalance = useMemo(() => {
    return allAccountNames.reduce((sum, name) => {
      const info = accountLatestBalances[name];
      return sum + (info ? info.latestBalance : 0);
    }, 0);
  }, [allAccountNames, accountLatestBalances]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <span>🏦</span> 銀行口座・残高管理
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              支払方法 (payment_methods) から「銀行口座」カテゴリを区別管理し、現在残高の記録と総資産の推移を可視化します。
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAddAccountModal(true)}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow"
          >
            ＋ 銀行口座を追加
          </button>
        </div>

        {/* Payment Methods Classification Overview Card */}
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-3">
          <h2 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
            <span>🏷️</span> 支払方法 (payment_methods) カテゴリ分類状況
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 rounded-xl">
              <div className="text-blue-800 dark:text-blue-300 font-semibold mb-1">🏦 銀行口座 ({categorizedPaymentMethods.bankAccountsList.length})</div>
              <div className="text-gray-600 dark:text-gray-300 font-bold truncate">
                {categorizedPaymentMethods.bankAccountsList.map((m) => m.name).join(', ') || '登録なし'}
              </div>
            </div>

            <div className="p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-100 dark:border-purple-800/50 rounded-xl">
              <div className="text-purple-800 dark:text-purple-300 font-semibold mb-1">💳 クレジットカード ({categorizedPaymentMethods.creditCards.length})</div>
              <div className="text-gray-600 dark:text-gray-300 font-bold truncate">
                {categorizedPaymentMethods.creditCards.map((m) => m.name).join(', ') || '登録なし'}
              </div>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 rounded-xl">
              <div className="text-emerald-800 dark:text-emerald-300 font-semibold mb-1">💵 現金 ({categorizedPaymentMethods.cashList.length})</div>
              <div className="text-gray-600 dark:text-gray-300 font-bold truncate">
                {categorizedPaymentMethods.cashList.map((m) => m.name).join(', ') || '登録なし'}
              </div>
            </div>

            <div className="p-3 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-xl">
              <div className="text-gray-700 dark:text-gray-300 font-semibold mb-1">⚙️ その他 ({categorizedPaymentMethods.otherList.length})</div>
              <div className="text-gray-600 dark:text-gray-300 font-bold truncate">
                {categorizedPaymentMethods.otherList.map((m) => m.name).join(', ') || 'なし'}
              </div>
            </div>
          </div>
        </div>

        {/* Global Assets Summary Banner */}
        <div className="p-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl text-white shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="text-xs text-teal-100 font-semibold tracking-wider uppercase">
              登録口座 総現在残高
            </div>
            <div className="text-xs text-teal-200 mt-1">
              ※全{allAccountNames.length}口座の最新記録残高の合計値
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-4xl font-extrabold tracking-tight">
              ¥{totalAssetsBalance.toLocaleString()}
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

        {/* Add Account Modal Form */}
        {showAddAccountModal && (
          <div className="p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <span>➕</span> 新規銀行口座の登録 (payment_methods: bank_account)
              </h3>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAccountSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  口座表示名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="例: 三菱UFJ メイン口座"
                  required
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  金融機関名 (任意)
                </label>
                <input
                  type="text"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  placeholder="例: 三菱UFJ銀行"
                  className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow disabled:opacity-50"
                >
                  {isPending ? '登録中...' : '口座を登録'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Bank Accounts Grid */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <span>🏦</span> 口座一覧 & 現在残高
          </h2>

          {loading ? (
            <div className="p-6 text-center text-gray-500 text-sm">読み込み中...</div>
          ) : allAccountNames.length === 0 ? (
            <div className="p-8 bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 text-center text-gray-500 text-sm space-y-3">
              <div>登録されている銀行口座がありません。</div>
              <button
                type="button"
                onClick={() => setShowAddAccountModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition"
              >
                口座を追加する
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {allAccountNames.map((accName) => {
                const isSelected = activeAccount === accName;
                const info = accountLatestBalances[accName];

                return (
                  <div
                    key={accName}
                    onClick={() => setSelectedAccountName(accName)}
                    className={`p-5 rounded-2xl border cursor-pointer transition shadow-sm flex flex-col justify-between ${
                      isSelected
                        ? 'bg-teal-50/80 dark:bg-teal-900/30 border-teal-500 ring-2 ring-teal-500/20'
                        : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-base truncate flex items-center gap-1.5">
                          <span>🏦</span>
                          <span>{accName}</span>
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-800 dark:text-teal-300 font-semibold">
                          銀行口座
                        </span>
                      </div>

                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        最新記録日: <span className="font-semibold text-gray-700 dark:text-gray-300">{info ? info.latestDate : '未記録'}</span>
                      </div>

                      <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/60 space-y-1">
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-semibold">
                          現在の残高
                        </div>
                        <div className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
                          ¥{info ? info.latestBalance.toLocaleString() : '0'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Account Balance History & Record Form */}
        {activeAccount && (
          <div className="space-y-6">
            {/* Record New Balance Snapshot Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                <h2 className="font-bold text-base flex items-center gap-2">
                  <span>📝</span> 「{activeAccount}」の残高を随時記録
                </h2>
                <span className="text-xs text-gray-400">通帳やアプリの現在残高を入力</span>
              </div>

              <form onSubmit={handleAddBalanceSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    記録日 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    required
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    現在残高 (円) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={balanceAmount}
                    onChange={(e) => setBalanceAmount(e.target.value)}
                    placeholder="例: 500000"
                    required
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs font-bold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                    メモ (任意)
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="例: 給与振込後、月末記帳"
                    className="w-full p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition shadow disabled:opacity-50"
                  >
                    {isPending ? '保存中...' : '残高記録を保存'}
                  </button>
                </div>
              </form>
            </div>

            {/* Balance History Log Table */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              <div className="p-4 bg-gray-50 dark:bg-gray-750 text-xs font-bold text-gray-500 dark:text-gray-400 flex justify-between items-center border-b border-gray-100 dark:border-gray-700">
                <span>「{activeAccount}」の残高記録履歴 ({activeAccountBalances.length}件)</span>
                <span>時系列順</span>
              </div>

              {activeAccountBalances.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm">
                  残高記録がまだありません。上のフォームから現在の口座残高を記録してください。
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {activeAccountBalances.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 sm:px-6 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 font-semibold">
                          {item.recordDate}
                        </span>
                        {item.memo && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {item.memo}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-extrabold text-base sm:text-lg text-teal-600 dark:text-teal-400">
                          ¥{item.balance.toLocaleString()}
                        </span>
                        <button
                          onClick={() => handleDeleteBalanceRecord(item.id)}
                          disabled={isPending}
                          className="text-xs text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1 rounded transition"
                          title="削除"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
