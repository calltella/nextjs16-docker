import { normalizeName } from './string-utils';

function runTests() {
  console.log('--- Running String Utils Tests ---');

  // Test 1: Full-width space conversion
  const fullWidth = '広島銀行\u3000古市支店';
  const halfWidth = '広島銀行 古市支店';
  if (normalizeName(fullWidth) !== halfWidth) {
    throw new Error(`Expected "${halfWidth}", got "${normalizeName(fullWidth)}"`);
  }
  console.log('✅ PASS: Full-width space converted to single half-width space');

  // Test 2: Multiple spaces collapsing
  const multiSpaces = '広島銀行   カープ支店  ';
  const expectedMulti = '広島銀行 カープ支店';
  if (normalizeName(multiSpaces) !== expectedMulti) {
    throw new Error(`Expected "${expectedMulti}", got "${normalizeName(multiSpaces)}"`);
  }
  console.log('✅ PASS: Multiple spaces collapsed and trimmed');

  // Test 3: Null and undefined handling
  if (normalizeName(null) !== '' || normalizeName(undefined) !== '') {
    throw new Error('Expected empty string for null/undefined');
  }
  console.log('✅ PASS: Null and undefined handled gracefully');

  console.log('All string-utils unit tests passed successfully!');
}

runTests();
