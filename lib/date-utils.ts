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
 * Helper to check if a date is the Nth Monday of a month (1-indexed month).
 */
function isNthMonday(year: number, month: number, day: number, n: number): boolean {
  const date = new Date(year, month - 1, day);
  if (date.getDay() !== 1) return false;
  const mondayCount = Math.ceil(day / 7);
  return mondayCount === n;
}

/**
 * Calculates Spring Equinox day (春分の日)
 */
function getVernalEquinoxDay(year: number): number {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * Calculates Autumn Equinox day (秋分の日)
 */
function getAutumnalEquinoxDay(year: number): number {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * Checks if a given year, month, day is a Japanese national holiday (国民の祝日).
 */
export function isJapaneseHoliday(year: number, month: number, day: number): boolean {
  // Fixed holidays
  if (month === 1 && day === 1) return true; // 元日
  if (month === 2 && day === 11) return true; // 建国記念の日
  if (month === 2 && day === 23) return true; // 天皇誕生日
  if (month === 4 && day === 29) return true; // 昭和の日
  if (month === 5 && day === 3) return true; // 憲法記念日
  if (month === 5 && day === 4) return true; // みどりの日
  if (month === 5 && day === 5) return true; // こどもの日
  if (month === 8 && day === 11) return true; // 山の日
  if (month === 11 && day === 3) return true; // 文化の日
  if (month === 11 && day === 23) return true; // 勤労感謝の日

  // Happy Mondays
  if (month === 1 && isNthMonday(year, 1, day, 2)) return true; // 成人の日 (第2月曜)
  if (month === 7 && isNthMonday(year, 7, day, 3)) return true; // 海の日 (第3月曜)
  if (month === 9 && isNthMonday(year, 9, day, 3)) return true; // 敬老の日 (第3月曜)
  if (month === 10 && isNthMonday(year, 10, day, 2)) return true; // スポーツの日 (第2月曜)

  // Equinoxes
  if (month === 3 && day === getVernalEquinoxDay(year)) return true;
  if (month === 9 && day === getAutumnalEquinoxDay(year)) return true;

  // Substitute holiday (振替休日): if Sunday was a holiday, Monday (or next non-holiday) is substitute holiday
  const date = new Date(year, month - 1, day);
  if (date.getDay() === 1) { // Monday
    const prevDate = new Date(year, month - 1, day - 1);
    if (isJapaneseHoliday(prevDate.getFullYear(), prevDate.getMonth() + 1, prevDate.getDate())) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a given date is a weekend or Japanese national holiday.
 */
export function isHolidayOrWeekend(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return true; // Sunday or Saturday
  return isJapaneseHoliday(year, month, day);
}

/**
 * Finds the nearest weekday (non-weekend, non-holiday) for a given target date (year, month, day).
 * Searches around the target date in order of distance (0, -1, +1, -2, +2, -3, +3...).
 */
export function getNearestWeekday(year: number, month: number, day: number): Date {
  const baseDate = new Date(year, month - 1, day);

  if (!isHolidayOrWeekend(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate())) {
    return baseDate;
  }

  // Search expanding distance: -1, +1, -2, +2, -3, +3...
  for (let offset = 1; offset <= 10; offset++) {
    // Check earlier date (-offset) first
    const prevCandidate = new Date(year, month - 1, day - offset);
    if (
      !isHolidayOrWeekend(
        prevCandidate.getFullYear(),
        prevCandidate.getMonth() + 1,
        prevCandidate.getDate()
      )
    ) {
      return prevCandidate;
    }

    // Check later date (+offset)
    const nextCandidate = new Date(year, month - 1, day + offset);
    if (
      !isHolidayOrWeekend(
        nextCandidate.getFullYear(),
        nextCandidate.getMonth() + 1,
        nextCandidate.getDate()
      )
    ) {
      return nextCandidate;
    }
  }

  return baseDate;
}

/**
 * Calculates start and end dates for a target year/month given a month start setting.
 * - If adjustNearestWeekday is true: computes start date as nearest weekday to 15th of previous month,
 *   and end date as the day before nearest weekday to 15th of target month.
 * - If startDay is 1: range is YYYY-MM-01 to YYYY-MM-(lastDay).
 * - If startDay > 1: range is (prevYear)-(prevMonth)-(startDay) to (targetYear)-(targetMonth)-(startDay - 1).
 */
export function getMonthlyDateRange(
  year: number,
  month: number,
  startDay: number = 1,
  adjustNearestWeekday: boolean = false
): { startDate: string; endDate: string } {
  if (adjustNearestWeekday) {
    // Previous month 15th
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear = year - 1;
    }

    const prevStartNearest = getNearestWeekday(prevYear, prevMonth, 15);
    const currStartNearest = getNearestWeekday(year, month, 15);

    // End date is day before currStartNearest
    const currEndNearest = new Date(currStartNearest);
    currEndNearest.setDate(currEndNearest.getDate() - 1);

    return {
      startDate: formatDate(prevStartNearest),
      endDate: formatDate(currEndNearest),
    };
  }

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
