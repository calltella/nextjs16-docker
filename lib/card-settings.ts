export interface CardSetting {
  cardName: string;
  closingDay: number; // 0 = 月末, 1~31 = 日付
  paymentMonthOffset: number; // 0 = 当月, 1 = 翌月, 2 = 翌々月
  paymentDay: number; // 0 = 月末, 1~31 = 日付
}

export const DEFAULT_CARD_SETTING: Omit<CardSetting, 'cardName'> = {
  closingDay: 15,
  paymentMonthOffset: 1, // 翌月
  paymentDay: 10,
};

/**
 * Returns string in YYYY-MM-DD format
 */
function formatDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get last day of a given year and month (1-indexed month)
 */
export function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Normalizes day value to valid day of that year/month (e.g. Feb 30 -> Feb 28/29)
 */
function normalizeDay(year: number, month: number, day: number): number {
  if (day === 0) return getLastDayOfMonth(year, month);
  const maxDays = getLastDayOfMonth(year, month);
  return Math.min(day, maxDays);
}

/**
 * Calculates the payment month (YYYY-MM) and exact payment date (YYYY-MM-DD) for a given transaction date.
 */
export function getPaymentInfoForTransaction(
  transactionDate: string, // YYYY-MM-DD
  setting: Omit<CardSetting, 'cardName'>
): { paymentMonth: string; paymentDate: string; closingDate: string } {
  if (!transactionDate || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
    return { paymentMonth: '', paymentDate: '', closingDate: '' };
  }

  const [tYear, tMonth, tDay] = transactionDate.split('-').map(Number);

  let closingYear = tYear;
  let closingMonth = tMonth;

  if (setting.closingDay !== 0) {
    const actualClosingDay = normalizeDay(tYear, tMonth, setting.closingDay);
    if (tDay > actualClosingDay) {
      // Transaction is after this month's closing date, so closing month is next month
      closingMonth += 1;
      if (closingMonth > 12) {
        closingMonth = 1;
        closingYear += 1;
      }
    }
  }

  const actualClosingDayForMonth = normalizeDay(closingYear, closingMonth, setting.closingDay);
  const closingDateStr = formatDate(closingYear, closingMonth, actualClosingDayForMonth);

  // Payment Month is closing month + paymentMonthOffset
  let payMonth = closingMonth + setting.paymentMonthOffset;
  let payYear = closingYear;
  while (payMonth > 12) {
    payMonth -= 12;
    payYear += 1;
  }

  const paymentMonthStr = `${payYear}-${String(payMonth).padStart(2, '0')}`;
  const actualPayDay = normalizeDay(payYear, payMonth, setting.paymentDay);
  const paymentDateStr = formatDate(payYear, payMonth, actualPayDay);

  return {
    paymentMonth: paymentMonthStr,
    paymentDate: paymentDateStr,
    closingDate: closingDateStr,
  };
}

/**
 * For a target payment month (e.g. "2026-03"), calculates:
 * - billingCycleStart: YYYY-MM-DD
 * - billingCycleEnd: YYYY-MM-DD (closing date)
 * - paymentDate: YYYY-MM-DD
 */
export function getBillingCycleForPaymentMonth(
  targetPaymentMonth: string, // YYYY-MM
  setting: Omit<CardSetting, 'cardName'>
): { billingCycleStart: string; billingCycleEnd: string; paymentDate: string } {
  if (!targetPaymentMonth || !/^\d{4}-\d{2}$/.test(targetPaymentMonth)) {
    return { billingCycleStart: '', billingCycleEnd: '', paymentDate: '' };
  }

  const [pYear, pMonth] = targetPaymentMonth.split('-').map(Number);

  // Closing month = payment month - paymentMonthOffset
  let closingMonth = pMonth - setting.paymentMonthOffset;
  let closingYear = pYear;
  while (closingMonth < 1) {
    closingMonth += 12;
    closingYear -= 1;
  }

  const closingDay = normalizeDay(closingYear, closingMonth, setting.closingDay);
  const billingCycleEnd = formatDate(closingYear, closingMonth, closingDay);

  // Cycle start: day after previous closing date
  let prevClosingMonth = closingMonth - 1;
  let prevClosingYear = closingYear;
  if (prevClosingMonth < 1) {
    prevClosingMonth = 12;
    prevClosingYear -= 1;
  }

  let billingCycleStart: string;
  if (setting.closingDay === 0) {
    // If closing on month end, cycle start is 1st day of closing month
    billingCycleStart = formatDate(closingYear, closingMonth, 1);
  } else {
    // Day after prev closing day
    const prevClosingDay = normalizeDay(prevClosingYear, prevClosingMonth, setting.closingDay);
    const prevClosingDateObj = new Date(prevClosingYear, prevClosingMonth - 1, prevClosingDay);
    prevClosingDateObj.setDate(prevClosingDateObj.getDate() + 1);
    billingCycleStart = formatDate(
      prevClosingDateObj.getFullYear(),
      prevClosingDateObj.getMonth() + 1,
      prevClosingDateObj.getDate()
    );
  }

  const payDay = normalizeDay(pYear, pMonth, setting.paymentDay);
  const paymentDate = formatDate(pYear, pMonth, payDay);

  return {
    billingCycleStart,
    billingCycleEnd,
    paymentDate,
  };
}
