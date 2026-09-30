import {
  getDaysInMonth,
  formatDate,
  formatDateJapanese,
  getMonthlyDateRange,
  isJapaneseHoliday,
  isHolidayOrWeekend,
  getPrecedingWeekday,
} from './date-utils';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expected}\nActual: ${actual}`);
  }
}

// Test getDaysInMonth
assertEqual(getDaysInMonth(2026, 1), 31, 'Jan 2026 has 31 days');
assertEqual(getDaysInMonth(2026, 2), 28, 'Feb 2026 has 28 days');
assertEqual(getDaysInMonth(2024, 2), 29, 'Feb 2024 (leap year) has 29 days');

// Test formatDate
assertEqual(formatDate(new Date(2026, 2, 15)), '2026-03-15', 'Format date');

// Test formatDateJapanese
assertEqual(formatDateJapanese('2026-03-25'), '2026年3月25日', 'Format date JP');

// Test isJapaneseHoliday
assertEqual(isJapaneseHoliday(2026, 1, 1), true, 'Jan 1 is 元日');
assertEqual(isJapaneseHoliday(2026, 2, 11), true, 'Feb 11 is 建国記念の日');
assertEqual(isJapaneseHoliday(2026, 5, 3), true, 'May 3 is 憲法記念日');

// Test isHolidayOrWeekend
assertEqual(isHolidayOrWeekend(2026, 3, 14), true, 'March 14, 2026 is Saturday');
assertEqual(isHolidayOrWeekend(2026, 3, 15), true, 'March 15, 2026 is Sunday');
assertEqual(isHolidayOrWeekend(2026, 3, 16), false, 'March 16, 2026 is Monday');

// Test getPrecedingWeekday
// March 15, 2026 is Sunday. Preceding weekday (直前の平日) is Friday, March 13.
const precedingForMar15 = getPrecedingWeekday(2026, 3, 15);
assertEqual(formatDate(precedingForMar15), '2026-03-13', 'March 15, 2026 (Sun) -> preceding weekday March 13 (Fri)');

// February 15, 2026 is Sunday -> preceding weekday Feb 13 (Fri)
const precedingForFeb15 = getPrecedingWeekday(2026, 2, 15);
assertEqual(formatDate(precedingForFeb15), '2026-02-13', 'Feb 15, 2026 (Sun) -> preceding weekday Feb 13 (Fri)');

// August 15, 2026 is Saturday -> preceding weekday Aug 14 (Fri)
const precedingForAug15 = getPrecedingWeekday(2026, 8, 15);
assertEqual(formatDate(precedingForAug15), '2026-08-14', 'Aug 15, 2026 (Sat) -> preceding weekday Aug 14 (Fri)');

// Test getMonthlyDateRange - adjustPrecedingWeekday = true
// For March 2026:
// Prev month start (Feb 15, 2026 Sun) -> preceding weekday Feb 13, 2026 (Fri)
// Curr month start (Mar 15, 2026 Sun) -> preceding weekday Mar 13, 2026 (Fri) -> Day before is Mar 12, 2026 (Thu)
const rangePreceding15 = getMonthlyDateRange(2026, 3, 15, true);
assertEqual(rangePreceding15.startDate, '2026-02-13', 'March 2026 adjustPrecedingWeekday=true startDate');
assertEqual(rangePreceding15.endDate, '2026-03-12', 'March 2026 adjustPrecedingWeekday=true endDate');

console.log('All date-utils unit tests passed successfully!');
