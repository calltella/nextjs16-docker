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
  getTransactions,
  getCardSettingsFromDb,
} from '@/app/dashboard/actions';
import { normalizeName } from '@/lib/string-utils';
import { getMonthlyDateRange, formatDateJapanese, formatDateWithDayOfWeek } from '@/lib/date-utils';
import { CardSetting, DEFAULT_CARD_SETTING, getBillingCycleForPaymentMonth } from '@/lib/card-settings';

interface BankAccountItem {
  id: number;
  userId: string;
  paymentMethodId?: number | null;
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

interface TransactionItem {
  id: number;
  date: string;
  type: string;
  paymentMethod?: string | null;
  paymentMethodId?: number | null;
  paymentMethodType?: string | null;
  parentCategory?: string | null;
  childCategory?: string | null;
  amount?: number | null;
  location?: string | null;
  memo?: string | null;
  note?: string | null;
  tag?: string | null;
}

const ACCOUNTS_STORAGE_KEY = 'kakeibo_bank_accounts_v1';
const BALANCES_STORAGE_KEY = 'kakeibo_bank_balances_v1';
const CARD_SETTINGS_STORAGE_KEY = 'kakeibo_card_settings_v1';

function subscribeLocalStorage(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('kakeibo_accounts_change', callback);
  window.addEventListener('kakeibo_card_settings_change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('kakeibo_accounts_change', callback);
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
  const localCardSettingsMap = useSyncExternalStore(
    subscribeLocalStorage,
    getCardSettingsSnapshot,
    getServerCardSettingsSnapshot
  );

  const [dbAccounts, setDbAccounts] = useState<BankAccountItem[]>([]);
  const [dbBalances, setDbBalances] = useState<BankBalanceItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([]);
  const [allTransactions, setAllTransactions] = useState<TransactionItem[]>([]);
  const [dbCardSettingsMap, setDbCardSettingsMap] = useState<Record<string, Omit<CardSetting, 'cardName'>>>({});

  const cardSettingsMap = useMemo(() => {
    return { ...localCardSettingsMap, ...dbCardSettingsMap };
  }, [localCardSettingsMap, dbCardSettingsMap]);

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [selectedAccountName, setSelectedAccountName] = useState<string | null>(null);

  // Target Year/Month for 15th-based period
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);

  const dateRange = useMemo(() => {
    return getMonthlyDateRange(selectedYear, selectedMonth, 15, true);
  }, [selectedYear, selectedMonth]);

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
    Promise.all([
      getBankAccounts(),
      getBankBalances(),
      getPaymentMethodsCategorized(),
      getTransactions(),
      getCardSettingsFromDb(),
    ]).then(([accRes, balRes, pmRes, txRes, csRes]) => {
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
        if (txRes.data) {
          setAllTransactions(txRes.data as TransactionItem[]);
        }
        if (csRes.data) {
          const map: Record<string, Omit<CardSetting, 'cardName'>> = {};
          csRes.data.forEach((row) => {
            map[normalizeName(row.cardName)] = {
              isCreditCard: row.isCreditCard ?? true,
              closingDay: row.closingDay,
              paymentMonthOffset: row.paymentMonthOffset,
              paymentDay: row.paymentDay,
              linkedBankAccount: row.linkedBankAccount ? normalizeName(row.linkedBankAccount) : '',
            };
          });
          setDbCardSettingsMap(map);
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

  // Combined accounts list (from bank_accounts or balance records or payment_methods of type bank_account or linked bank accounts)
  const allAccountNames = useMemo(() => {
    const namesSet = new Set<string>();
    accounts.forEach((acc) => namesSet.add(normalizeName(acc.accountName)));
    balances.forEach((bal) => namesSet.add(normalizeName(bal.accountName)));
    categorizedPaymentMethods.bankAccountsList.forEach((pm) => namesSet.add(normalizeName(pm.name)));
    Object.values(cardSettingsMap).forEach((setting) => {
      if (setting.linkedBankAccount) {
        namesSet.add(normalizeName(setting.linkedBankAccount));
      }
    });
    return Array.from(namesSet);
  }, [accounts, balances, categorizedPaymentMethods, cardSettingsMap]);

  const activeAccount = selectedAccountName || (allAccountNames.length > 0 ? allAccountNames[0] : '');

  // Map payment method normalized name to ID
  const pmNameToIdMap = useMemo(() => {
    const map = new Map<string, number>();
    paymentMethods.forEach((pm) => {
      map.set(normalizeName(pm.name), pm.id);
    });
    return map;
  }, [paymentMethods]);

  // Identify credit card names and paymentMethodIds accurately
  const creditCardNamesSet = useMemo(() => {
    const set = new Set<string>();
    const bankNamesSet = new Set<string>();
    categorizedPaymentMethods.bankAccountsList.forEach((b) => bankNamesSet.add(normalizeName(b.name)));
    allAccountNames.forEach((a) => bankNamesSet.add(normalizeName(a)));

    categorizedPaymentMethods.creditCards.forEach((c) => {
      const norm = normalizeName(c.name);
      if (!bankNamesSet.has(norm)) {
        set.add(norm);
      }
    });

    Object.entries(cardSettingsMap).forEach(([name, setting]) => {
      const norm = normalizeName(name);
      if (setting && setting.isCreditCard !== false && !bankNamesSet.has(norm)) {
        set.add(norm);
      }
    });

    return set;
  }, [categorizedPaymentMethods, cardSettingsMap, allAccountNames]);

  const creditCardPaymentMethodIdsSet = useMemo(() => {
    const set = new Set<number>();
    categorizedPaymentMethods.creditCards.forEach((c) => set.add(c.id));
    Object.keys(cardSettingsMap).forEach((name) => {
      const id = pmNameToIdMap.get(normalizeName(name));
      if (id) set.add(id);
    });
    return set;
  }, [categorizedPaymentMethods, cardSettingsMap, pmNameToIdMap]);

  // Set of all paymentMethod.id that belong to bank accounts
  const bankAccountPaymentMethodIdsSet = useMemo(() => {
    const set = new Set<number>();
    categorizedPaymentMethods.bankAccountsList.forEach((b) => set.add(b.id));
    accounts.forEach((acc) => {
      if (acc.paymentMethodId) set.add(acc.paymentMethodId);
    });
    return set;
  }, [categorizedPaymentMethods, accounts]);

  // Compute real-time current balance for each bank account (incorporating transactions & card deductions)
  const accountLatestBalances = useMemo(() => {
    const map: Record<string, { latestBalance: number; latestDate: string }> = {};

    allAccountNames.forEach((accName) => {
      const normActive = normalizeName(accName);

      // Find latest recorded snapshot balance
      const accountSnapshots = balances
        .filter((b) => normalizeName(b.accountName) === normActive)
        .sort((a, b) => a.recordDate.localeCompare(b.recordDate));

      const latestSnapshot = accountSnapshots.length > 0 ? accountSnapshots[accountSnapshots.length - 1] : null;
      const snapshotDate = latestSnapshot ? latestSnapshot.recordDate : '1970-01-01';
      let currentBal = latestSnapshot ? latestSnapshot.balance : 0;
      let maxDate = latestSnapshot ? latestSnapshot.recordDate : '';

      const currentAccObj = accounts.find((a) => normalizeName(a.accountName) === normActive);
      const bankNameNorm = currentAccObj?.bankName ? normalizeName(currentAccObj.bankName) : '';

      const targetPaymentMethodId =
        currentAccObj?.paymentMethodId ||
        pmNameToIdMap.get(normActive) ||
        (bankNameNorm ? pmNameToIdMap.get(bankNameNorm) : undefined);

      // Helper to check if a transaction belongs to this bank account
      const isDirectTx = (tx: TransactionItem) => {
        if (!tx.date) return false;

        // Exclude credit cards
        if (tx.paymentMethodId && creditCardPaymentMethodIdsSet.has(tx.paymentMethodId)) return false;
        const pmNorm = normalizeName(tx.paymentMethod);
        if (pmNorm && creditCardNamesSet.has(pmNorm)) return false;

        // 1. Direct match by transactions.payment_method_id
        if (tx.paymentMethodId && targetPaymentMethodId && tx.paymentMethodId === targetPaymentMethodId) {
          return true;
        }

        // Check if tx.paymentMethodId is mapped to another specific bank account
        const isMappedToOther = allAccountNames.some((otherAccName) => {
          const normOther = normalizeName(otherAccName);
          if (normOther === normActive) return false;
          const otherAccObj = accounts.find((a) => normalizeName(a.accountName) === normOther);
          const otherBankNameNorm = otherAccObj?.bankName ? normalizeName(otherAccObj.bankName) : '';
          const otherPmId =
            otherAccObj?.paymentMethodId ||
            pmNameToIdMap.get(normOther) ||
            (otherBankNameNorm ? pmNameToIdMap.get(otherBankNameNorm) : undefined);
          return otherPmId && tx.paymentMethodId === otherPmId;
        });

        if (isMappedToOther) {
          return false;
        }

        // 2. Direct match if tx.paymentMethodType === 'bank_account' or tx.paymentMethodId is in bankAccountPaymentMethodIdsSet
        const isBankAccountType =
          tx.paymentMethodType === 'bank_account' ||
          (tx.paymentMethodId && bankAccountPaymentMethodIdsSet.has(tx.paymentMethodId));

        if (isBankAccountType) {
          if (
            pmNorm === normActive ||
            (bankNameNorm && pmNorm === bankNameNorm) ||
            pmNorm.includes(normActive) ||
            normActive.includes(pmNorm) ||
            (bankNameNorm && (pmNorm.includes(bankNameNorm) || bankNameNorm.includes(pmNorm)))
          ) {
            return true;
          }

          const primaryAccount = allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '';
          if (normActive === primaryAccount) {
            return true;
          }
        }

        // 3. Fallback match by name
        if (pmNorm) {
          const isMatch =
            pmNorm === normActive ||
            (bankNameNorm && pmNorm === bankNameNorm) ||
            pmNorm.includes(normActive) ||
            normActive.includes(pmNorm) ||
            (bankNameNorm && (pmNorm.includes(bankNameNorm) || bankNameNorm.includes(pmNorm)));
          if (isMatch) return true;
        }

        const genericBankTerms = ['口座引き落とし', '銀行引き落とし', '口座振替', '振込', '銀行', '預金', '口座', '給与'];
        const isGeneric = !pmNorm || genericBankTerms.some((term) => pmNorm.includes(term));
        if (isGeneric) {
          const primaryAccount = allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '';
          if (normActive === primaryAccount) return true;
        }

        return false;
      };

      // Direct transactions for this bank account after snapshotDate
      allTransactions.forEach((tx) => {
        if (tx.date && tx.date >= snapshotDate && isDirectTx(tx)) {
          const isIncome = tx.type === '収入' || tx.type === 'income';
          const amt = tx.amount || 0;
          if (isIncome) {
            currentBal += amt;
          } else {
            currentBal -= amt;
          }
          if (tx.date > maxDate) maxDate = tx.date;
        }
      });

      // Credit card billing deductions after snapshotDate
      categorizedPaymentMethods.creditCards.forEach((card) => {
        const cardName = normalizeName(card.name);
        const setting = cardSettingsMap[cardName] || DEFAULT_CARD_SETTING;

        const linkedAccount = setting.linkedBankAccount ? normalizeName(setting.linkedBankAccount) : '';
        const targetAccount = linkedAccount || (allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '');

        if (targetAccount === normActive) {
          const curY = selectedYear;
          const curM = selectedMonth;

          for (let offset = -12; offset <= 3; offset++) {
            const dt = new Date(curY, curM - 1 + offset, 1);
            const payMonth = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
            const cycle = getBillingCycleForPaymentMonth(payMonth, setting);

            if (cycle.paymentDate && cycle.paymentDate >= snapshotDate) {
              const totalBilled = allTransactions.reduce((sum, tx) => {
                const pm = normalizeName(tx.paymentMethod);
                if (pm !== cardName) return sum;
                if (!tx.date) return sum;
                const isExpense = tx.type === '支出' || tx.type === 'expense';
                if (isExpense && tx.date >= cycle.billingCycleStart && tx.date <= cycle.billingCycleEnd) {
                  return sum + (tx.amount || 0);
                }
                return sum;
              }, 0);

              if (totalBilled > 0) {
                currentBal -= totalBilled;
                if (cycle.paymentDate > maxDate) maxDate = cycle.paymentDate;
              }
            }
          }
        }
      });

      map[normActive] = {
        latestBalance: currentBal,
        latestDate: maxDate || '未記録',
      };
    });

    return map;
  }, [
    allAccountNames,
    accounts,
    allTransactions,
    balances,
    cardSettingsMap,
    categorizedPaymentMethods,
    creditCardNamesSet,
    creditCardPaymentMethodIdsSet,
    bankAccountPaymentMethodIdsSet,
    pmNameToIdMap,
    selectedYear,
    selectedMonth,
  ]);

  // Compute monthly log & cumulative balance for active account within dateRange
  const monthlyAccountData = useMemo(() => {
    if (!activeAccount) {
      return { initialBalance: 0, logItems: [] };
    }

    const normActive = normalizeName(activeAccount);

    // 1. Find latest recorded snapshot balance on or before dateRange.startDate
    const accountSnapshots = balances
      .filter((b) => normalizeName(b.accountName) === normActive)
      .sort((a, b) => a.recordDate.localeCompare(b.recordDate));

    const snapshotPriorOrOnStart = [...accountSnapshots]
      .reverse()
      .find((b) => b.recordDate <= dateRange.startDate);

    const initialBalance = snapshotPriorOrOnStart ? snapshotPriorOrOnStart.balance : 0;

    // Find matching account item to check bankName
    const currentAccObj = accounts.find((a) => normalizeName(a.accountName) === normActive);
    const bankNameNorm = currentAccObj?.bankName ? normalizeName(currentAccObj.bankName) : '';

    const targetPaymentMethodId =
      currentAccObj?.paymentMethodId ||
      pmNameToIdMap.get(normActive) ||
      (bankNameNorm ? pmNameToIdMap.get(bankNameNorm) : undefined);

    // 2. Direct transactions for this bank account (excluding credit card usages)
    const directTx = allTransactions.filter((tx) => {
      if (!tx.date) return false;
      if (tx.date < dateRange.startDate || tx.date > dateRange.endDate) return false;

      // Exclude credit cards
      if (tx.paymentMethodId && creditCardPaymentMethodIdsSet.has(tx.paymentMethodId)) return false;
      const pmNorm = normalizeName(tx.paymentMethod);
      if (pmNorm && creditCardNamesSet.has(pmNorm)) return false; // exclude card usage

      // 1. Direct match by transactions.payment_method_id
      if (tx.paymentMethodId && targetPaymentMethodId && tx.paymentMethodId === targetPaymentMethodId) {
        return true;
      }

      // Check if tx.paymentMethodId is mapped to another specific bank account
      const isMappedToOther = allAccountNames.some((otherAccName) => {
        const normOther = normalizeName(otherAccName);
        if (normOther === normActive) return false;
        const otherAccObj = accounts.find((a) => normalizeName(a.accountName) === normOther);
        const otherBankNameNorm = otherAccObj?.bankName ? normalizeName(otherAccObj.bankName) : '';
        const otherPmId =
          otherAccObj?.paymentMethodId ||
          pmNameToIdMap.get(normOther) ||
          (otherBankNameNorm ? pmNameToIdMap.get(otherBankNameNorm) : undefined);
        return otherPmId && tx.paymentMethodId === otherPmId;
      });

      if (isMappedToOther) {
        return false;
      }

      // 2. Direct match if tx.paymentMethodType === 'bank_account' or tx.paymentMethodId is in bankAccountPaymentMethodIdsSet
      const isBankAccountType =
        tx.paymentMethodType === 'bank_account' ||
        (tx.paymentMethodId && bankAccountPaymentMethodIdsSet.has(tx.paymentMethodId));

      if (isBankAccountType) {
        if (
          pmNorm === normActive ||
          (bankNameNorm && pmNorm === bankNameNorm) ||
          pmNorm.includes(normActive) ||
          normActive.includes(pmNorm) ||
          (bankNameNorm && (pmNorm.includes(bankNameNorm) || bankNameNorm.includes(pmNorm)))
        ) {
          return true;
        }

        const primaryAccount = allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '';
        if (normActive === primaryAccount) {
          return true;
        }
      }

      // 3. Fallback match by name
      if (pmNorm) {
        const isMatch =
          pmNorm === normActive ||
          (bankNameNorm && pmNorm === bankNameNorm) ||
          pmNorm.includes(normActive) ||
          normActive.includes(pmNorm) ||
          (bankNameNorm && (pmNorm.includes(bankNameNorm) || bankNameNorm.includes(pmNorm)));
        if (isMatch) return true;
      }

      const genericBankTerms = ['口座引き落とし', '銀行引き落とし', '口座振替', '振込', '銀行', '預金', '口座', '給与'];
      const isGeneric = !pmNorm || genericBankTerms.some((term) => pmNorm.includes(term));
      if (isGeneric) {
        const primaryAccount = allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '';
        if (normActive === primaryAccount) return true;
      }

      return false;
    });

    // 3. Generate credit card billing deductions falling in dateRange
    interface EventItem {
      id: string | number;
      date: string;
      type: string;
      title: string;
      category?: string;
      amount: number;
      isCcDeduction?: boolean;
    }

    const events: EventItem[] = [];

    directTx.forEach((tx) => {
      const isIncome = tx.type === '収入' || tx.type === 'income';
      const cat = tx.childCategory || tx.parentCategory || '収支';
      const title = tx.memo || tx.note || tx.location || cat;
      events.push({
        id: tx.id,
        date: tx.date,
        type: isIncome ? '収入' : '支出',
        title,
        category: cat,
        amount: tx.amount || 0,
      });
    });

    // Calculate card deductions for each credit card
    categorizedPaymentMethods.creditCards.forEach((card) => {
      const cardName = normalizeName(card.name);
      const setting = cardSettingsMap[cardName] || DEFAULT_CARD_SETTING;

      // Check linked bank account match
      const linkedAccount = setting.linkedBankAccount ? normalizeName(setting.linkedBankAccount) : '';

      // If linkedAccount is set, strictly check if it matches normActive
      // If linkedAccount is empty, assign to the primary/first bank account by default
      const targetAccount = linkedAccount || (allAccountNames.length > 0 ? normalizeName(allAccountNames[0]) : '');
      if (targetAccount !== normActive) {
        return; // Skip this card deduction if not targeted for active account
      }

      // Check payment months in vicinity
      const checkMonths: string[] = [];
      const [y, m] = [selectedYear, selectedMonth];

      [-1, 0, 1].forEach((offset) => {
        const dt = new Date(y, m - 1 + offset, 1);
        const mStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
        checkMonths.push(mStr);
      });

      checkMonths.forEach((payMonth) => {
        const cycle = getBillingCycleForPaymentMonth(payMonth, setting);
        if (cycle.paymentDate >= dateRange.startDate && cycle.paymentDate <= dateRange.endDate) {
          // Calculate total billed for this cycle
          const totalBilled = allTransactions.reduce((sum, tx) => {
            const pm = normalizeName(tx.paymentMethod);
            if (pm !== cardName) return sum;
            if (!tx.date) return sum;
            const isExpense = tx.type === '支出' || tx.type === 'expense';
            if (isExpense && tx.date >= cycle.billingCycleStart && tx.date <= cycle.billingCycleEnd) {
              return sum + (tx.amount || 0);
            }
            return sum;
          }, 0);

          if (totalBilled > 0) {
            const [, pM] = payMonth.split('-');
            events.push({
              id: `cc_deduct_${cardName}_${payMonth}`,
              date: cycle.paymentDate,
              type: '支出',
              title: `【カード引き落とし】${cardName} (${parseInt(pM, 10)}月分)`,
              category: 'カード引き落とし',
              amount: totalBilled,
              isCcDeduction: true,
            });
          }
        }
      });
    });

    // Sort events chronologically (oldest to newest)
    events.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let currentBal = initialBalance;
    const logItems = events.map((ev) => {
      if (ev.type === '収入') {
        currentBal += ev.amount;
      } else {
        currentBal -= ev.amount;
      }
      return {
        ...ev,
        balanceAfter: currentBal,
      };
    });

    return { initialBalance, logItems };
  }, [
    activeAccount,
    accounts,
    allAccountNames,
    allTransactions,
    balances,
    cardSettingsMap,
    categorizedPaymentMethods,
    creditCardNamesSet,
    creditCardPaymentMethodIdsSet,
    bankAccountPaymentMethodIdsSet,
    pmNameToIdMap,
    dateRange,
    selectedYear,
    selectedMonth,
  ]);

  // Active account recorded balance snapshots
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

        {/* Selected Account Balance History & Cumulative Log */}
        {activeAccount && (
          <div className="space-y-6">
            {/* Monthly Transaction & Balance Progression Section */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
              {/* Month Navigation & Period Banner */}
              <div className="p-5 border-b border-gray-100 dark:border-gray-700 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                      <span>📊</span> 「{activeAccount}」 月別口座出入金 & 累計残高履歴
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      月初（15日始まり・直前平日調整）基準の期間明細です。カード個別利用は除外し、引き落としのみ反映しています。
                    </p>
                  </div>

                  {/* Year/Month Navigation Picker */}
                  <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-750 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        let y = selectedYear;
                        let m = selectedMonth - 1;
                        if (m < 1) {
                          m = 12;
                          y -= 1;
                        }
                        setSelectedYear(y);
                        setSelectedMonth(m);
                      }}
                      className="px-2.5 py-1 text-xs hover:bg-white dark:hover:bg-gray-700 rounded-lg transition font-bold"
                    >
                      ← 前月
                    </button>
                    <span className="font-extrabold text-sm text-teal-700 dark:text-teal-300 px-2">
                      {selectedYear}年{selectedMonth}月期
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        let y = selectedYear;
                        let m = selectedMonth + 1;
                        if (m > 12) {
                          m = 1;
                          y += 1;
                        }
                        setSelectedYear(y);
                        setSelectedMonth(m);
                      }}
                      className="px-2.5 py-1 text-xs hover:bg-white dark:hover:bg-gray-700 rounded-lg transition font-bold"
                    >
                      次月 →
                    </button>
                  </div>
                </div>

                {/* Period Range Banner */}
                <div className="p-4 bg-teal-50 dark:bg-teal-900/30 border border-teal-100 dark:border-teal-800/50 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="text-xs">
                    <span className="font-bold text-teal-800 dark:text-teal-300">集計対象期間 (15日始まり):</span>{' '}
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {formatDateJapanese(dateRange.startDate)} 〜 {formatDateJapanese(dateRange.endDate)}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    期首残高: <span className="font-bold text-teal-700 dark:text-teal-300">¥{monthlyAccountData.initialBalance.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Monthly Account Line Items & Running Balance Table */}
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                <div className="p-4 bg-gray-50 dark:bg-gray-750 text-xs font-bold text-gray-500 dark:text-gray-400 grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 text-center">No.</div>
                  <div className="col-span-3 sm:col-span-2">日付</div>
                  <div className="col-span-4 sm:col-span-5">摘要 / カテゴリ</div>
                  <div className="col-span-2 text-right">収支額</div>
                  <div className="col-span-2 text-right">累計残高</div>
                </div>

                {monthlyAccountData.logItems.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">
                    この集計期間中（{dateRange.startDate} 〜 {dateRange.endDate}）の口座出入金・引き落とし記録はありません。
                  </div>
                ) : (
                  monthlyAccountData.logItems.map((item, index) => {
                    const isIncome = item.type === '収入';
                    return (
                      <div
                        key={item.id}
                        className={`p-4 text-xs sm:text-sm grid grid-cols-12 gap-2 items-center hover:bg-gray-50 dark:hover:bg-gray-750 transition ${
                          item.isCcDeduction ? 'bg-purple-50/40 dark:bg-purple-900/10' : ''
                        }`}
                      >
                        <div className="col-span-1 text-center font-bold text-gray-400 dark:text-gray-500 text-xs">
                          {index + 1}
                        </div>

                        <div className="col-span-3 sm:col-span-2 text-gray-600 dark:text-gray-300 font-semibold">
                          {formatDateWithDayOfWeek(item.date)}
                        </div>

                        <div className="col-span-4 sm:col-span-5 flex flex-col sm:flex-row sm:items-center gap-1">
                          <span className="font-bold text-gray-900 dark:text-gray-100 truncate">{item.title}</span>
                          {item.category && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 w-fit shrink-0">
                              {item.category}
                            </span>
                          )}
                        </div>

                        <div className="col-span-2 text-right font-bold">
                          <span className={isIncome ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {isIncome ? '+' : '-'}¥{item.amount.toLocaleString()}
                          </span>
                        </div>

                        <div className="col-span-2 text-right font-extrabold text-teal-600 dark:text-teal-400">
                          ¥{item.balanceAfter.toLocaleString()}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Record New Balance Snapshot Form & Historical Snapshots */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3">
                  <h2 className="font-bold text-base flex items-center gap-2">
                    <span>📝</span> 「{activeAccount}」の期首・手動残高記録
                  </h2>
                  <span className="text-xs text-gray-400">通帳や口座アプリの実際の残高を基準点として入力</span>
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

              {/* Saved Snapshots list */}
              {activeAccountBalances.length > 0 && (
                <div className="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
                  <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
                    登録済み手動残高記録 ({activeAccountBalances.length}件)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeAccountBalances.map((b) => (
                      <div
                        key={b.id}
                        className="px-3 py-1.5 bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700 rounded-xl text-xs flex items-center gap-2"
                      >
                        <span className="font-semibold text-gray-600 dark:text-gray-300">{b.recordDate}:</span>
                        <span className="font-extrabold text-teal-600 dark:text-teal-400">¥{b.balance.toLocaleString()}</span>
                        {b.memo && <span className="text-[10px] text-gray-400">({b.memo})</span>}
                        <button
                          type="button"
                          onClick={() => handleDeleteBalanceRecord(b.id)}
                          className="text-[10px] text-gray-400 hover:text-red-500 ml-1 font-bold"
                          title="削除"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
