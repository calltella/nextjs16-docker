import {
  getDaysInMonth,
  formatDate,
  formatDateJapanese,
  getMonthlyDateRange,
  isJapaneseHoliday,
  isHolidayOrWeekend,
  getNearestWeekday,
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

// Test getNearestWeekday
// March 15, 2026 is Sunday. Nearest weekday is Monday, March 16.
const nearestForMar15 = getNearestWeekday(2026, 3, 15);
assertEqual(formatDate(nearestForMar15), '2026-03-16', 'March 15, 2026 (Sun) -> nearest weekday March 16 (Mon)');

// February 15, 2026 is Sunday -> nearest weekday Feb 16 (Mon)
const nearestForFeb15 = getNearestWeekday(2026, 2, 15);
assertEqual(formatDate(nearestForFeb15), '2026-02-16', 'Feb 15, 2026 (Sun) -> nearest weekday Feb 16 (Mon)');

// August 15, 2026 is Saturday. Friday Aug 14 is 1 day away (-1), Monday Aug 17 is 2 days away (+2).
// Nearest weekday is Friday, Aug 14.
const nearestForAug15 = getNearestWeekday(2026, 8, 15);
assertEqual(formatDate(nearestForAug15), '2026-08-14', 'Aug 15, 2026 (Sat) -> nearest weekday Aug 14 (Fri)');

// Test getMonthlyDateRange - adjustNearestWeekday = true
// For March 2026:
// Prev month start (Feb 15, 2026 Sun) -> Feb 16, 2026 (Mon)
// Curr month start (Mar 15, 2026 Sun) -> Mar 16, 2026 (Mon) -> Day before is Mar 15, 2026
const rangeNearest15 = getMonthlyDateRange(2026, 3, 15, true);
assertEqual(rangeNearest15.startDate, '2026-02-16', 'March 2026 nearestWeekday=true startDate');
assertEqual(rangeNearest15.endDate, '2026-03-15', 'March 2026 nearestWeekday=true endDate');

console.log('All date-utils unit tests passed successfully!');
