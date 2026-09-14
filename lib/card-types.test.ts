import assert from 'node:assert';
import { extractUniquePaymentMethods, filterNewPaymentMethods } from './card-types';

function testCardTypesLogic() {
  const transactions = [
    { paymentMethod: '三井住友カード' },
    { paymentMethod: '楽天カード' },
    { paymentMethod: '三井住友カード' },
    { paymentMethod: null },
    { paymentMethod: '' },
    { paymentMethod: ' JCBカード ' },
  ];

  const unique = extractUniquePaymentMethods(transactions);
  assert.strictEqual(unique.length, 3, 'Should extract 3 unique non-empty payment methods');
  assert.deepStrictEqual(unique, ['三井住友カード', '楽天カード', 'JCBカード']);

  const existingCardTypes = [
    { name: '三井住友カード', paymentMethod: '三井住友カード' },
    { name: 'VISAカード', paymentMethod: 'Visa' },
  ];

  const filtered = filterNewPaymentMethods(unique, existingCardTypes);
  assert.strictEqual(filtered.length, 2, 'Should filter out 三井住友カード which already exists');
  assert.deepStrictEqual(filtered, ['楽天カード', 'JCBカード']);

  console.log('All Card Types logic unit tests passed successfully!');
}

testCardTypesLogic();
