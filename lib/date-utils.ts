/**
 * Returns number of days in a given month (month: 1-12).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Formats Date object as YYYY-MM-DD string.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Formats YYYY-MM-DD date string to Japanese format (e.g., "2026年3月25日").
 */
export function formatDateJapanese(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return `${year}年${month}月${day}日`;
}

/**
 * Calculates start and end dates for a target year/month given a month start day (1 to 31).
 * - If startDay is 1: range is YYYY-MM-01 to YYYY-MM-(lastDay).
 * - If startDay > 1: range is (prevYear)-(prevMonth)-(startDay) to (targetYear)-(targetMonth)-(startDay - 1).
 */
export function getMonthlyDateRange(
  year: number,
  month: number,
  startDay: number = 1
): { startDate: string; endDate: string } {
  const safeStartDay = Math.max(1, Math.min(31, startDay));

  if (safeStartDay === 1) {
    const lastDay = getDaysInMonth(year, month);
    const mStr = String(month).padStart(2, '0');
    const lStr = String(lastDay).padStart(2, '0');
    return {
      startDate: `${year}-${mStr}-01`,
      endDate: `${year}-${mStr}-${lStr}`,
    };
  }

  // Previous month calculation
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const prevMaxDays = getDaysInMonth(prevYear, prevMonth);
  const actualStartDay = Math.min(safeStartDay, prevMaxDays);

  const targetMaxDays = getDaysInMonth(year, month);
  const targetEndDay = Math.min(safeStartDay - 1, targetMaxDays);

  const prevMStr = String(prevMonth).padStart(2, '0');
  const targetMStr = String(month).padStart(2, '0');
  const startDStr = String(actualStartDay).padStart(2, '0');
  const endDStr = String(targetEndDay).padStart(2, '0');

  return {
    startDate: `${prevYear}-${prevMStr}-${startDStr}`,
    endDate: `${year}-${targetMStr}-${endDStr}`,
  };
}
