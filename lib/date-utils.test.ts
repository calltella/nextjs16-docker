import {
  getDaysInMonth,
  formatDate,
  formatDateJapanese,
  getMonthlyDateRange,
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
assertEqual(getDaysInMonth(2026, 4), 30, 'Apr 2026 has 30 days');

// Test formatDate
assertEqual(formatDate(new Date(2026, 2, 15)), '2026-03-15', 'Format date');

// Test formatDateJapanese
assertEqual(formatDateJapanese('2026-03-25'), '2026年3月25日', 'Format date JP');

// Test getMonthlyDateRange - startDay = 1
const rangeStandard = getMonthlyDateRange(2026, 3, 1);
assertEqual(rangeStandard.startDate, '2026-03-01', 'March 2026 startDay=1 startDate');
assertEqual(rangeStandard.endDate, '2026-03-31', 'March 2026 startDay=1 endDate');

// Test getMonthlyDateRange - startDay = 25
const range25 = getMonthlyDateRange(2026, 3, 25);
assertEqual(range25.startDate, '2026-02-25', 'March 2026 startDay=25 startDate');
assertEqual(range25.endDate, '2026-03-24', 'March 2026 startDay=25 endDate');

// Test getMonthlyDateRange - January startDay = 25 (year rollover)
const rangeJan25 = getMonthlyDateRange(2026, 1, 25);
assertEqual(rangeJan25.startDate, '2025-12-25', 'Jan 2026 startDay=25 startDate');
assertEqual(rangeJan25.endDate, '2026-01-24', 'Jan 2026 startDay=25 endDate');

// Test getMonthlyDateRange - startDay clamping for Feb
const rangeFebClamped = getMonthlyDateRange(2026, 3, 31);
// Previous month (Feb 2026) has 28 days -> clamped to 28
assertEqual(rangeFebClamped.startDate, '2026-02-28', 'March 2026 startDay=31 clamped startDate');
assertEqual(rangeFebClamped.endDate, '2026-03-30', 'March 2026 startDay=31 endDate');

console.log('All date-utils unit tests passed successfully!');
