import { getPaymentInfoForTransaction, getBillingCycleForPaymentMonth } from './card-settings';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error(`❌ FAIL: ${message}\n  Expected: ${JSON.stringify(expected)}\n  Actual:   ${JSON.stringify(actual)}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

console.log('--- Running Card Settings Tests ---');

// Case 1: 15th closing, next month (offset 1), 10th payment
const setting15 = { closingDay: 15, paymentMonthOffset: 1, paymentDay: 10 };

// Transaction before/on closing day
const info1 = getPaymentInfoForTransaction('2026-03-10', setting15);
assertEqual(info1.closingDate, '2026-03-15', '2026-03-10 closing date is 2026-03-15');
assertEqual(info1.paymentMonth, '2026-04', '2026-03-10 payment month is 2026-04');
assertEqual(info1.paymentDate, '2026-04-10', '2026-03-10 payment date is 2026-04-10');

// Transaction after closing day
const info2 = getPaymentInfoForTransaction('2026-03-16', setting15);
assertEqual(info2.closingDate, '2026-04-15', '2026-03-16 closing date is 2026-04-15');
assertEqual(info2.paymentMonth, '2026-05', '2026-03-16 payment month is 2026-05');
assertEqual(info2.paymentDate, '2026-05-10', '2026-03-16 payment date is 2026-05-10');

// Billing cycle for 2026-04 payment month
const cycle1 = getBillingCycleForPaymentMonth('2026-04', setting15);
assertEqual(cycle1.billingCycleStart, '2026-02-16', '2026-04 payment cycle start is 2026-02-16');
assertEqual(cycle1.billingCycleEnd, '2026-03-15', '2026-04 payment cycle end is 2026-03-15');
assertEqual(cycle1.paymentDate, '2026-04-10', '2026-04 payment date is 2026-04-10');

// Case 2: Month-end closing (closingDay = 0), next month 27th payment
const settingEnd = { closingDay: 0, paymentMonthOffset: 1, paymentDay: 27 };
const info3 = getPaymentInfoForTransaction('2026-02-20', settingEnd);
assertEqual(info3.closingDate, '2026-02-28', 'Feb transaction with month-end closing date is 2026-02-28');
assertEqual(info3.paymentMonth, '2026-03', 'Feb transaction payment month is 2026-03');
assertEqual(info3.paymentDate, '2026-03-27', 'Feb transaction payment date is 2026-03-27');

console.log('All Card Settings unit tests passed successfully!');
