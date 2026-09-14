import assert from 'node:assert';
import { parseHouseholdCsv } from './csv';

const sampleCsv = `日付,収入/支出,入金/支払方法,親カテゴリ,子カテゴリ,金額,場所,メモ,備考,タグ
2022/01/07 00:00,支出,三井住友カード,趣味,,2800,バルト11,,,
2022/01/08 00:00,支出,三井住友カード,通信,インターネット,5724,,メガ・エッグ,,
2022/02/15 00:00,収入,広島銀行 古市支店,給与,,249006,,ゆういち,,
2022/02/15 08:00,支出,広島銀行 古市支店,おこずかい,,15000,,ゆういち,,`;

function testParseHouseholdCsv() {
  const rows = parseHouseholdCsv(sampleCsv);
  assert.strictEqual(rows.length, 4, 'Should parse 4 rows');

  // Row 1
  assert.strictEqual(rows[0].date, '2022-01-07');
  assert.strictEqual(rows[0].type, 'expense');
  assert.strictEqual(rows[0].paymentMethod, '三井住友カード');
  assert.strictEqual(rows[0].parentCategory, '趣味');
  assert.strictEqual(rows[0].category, '趣味');
  assert.strictEqual(rows[0].amount, 2800);
  assert.strictEqual(rows[0].location, 'バルト11');
  assert.strictEqual(rows[0].title, 'バルト11');

  // Row 2
  assert.strictEqual(rows[1].date, '2022-01-08');
  assert.strictEqual(rows[1].type, 'expense');
  assert.strictEqual(rows[1].parentCategory, '通信');
  assert.strictEqual(rows[1].subCategory, 'インターネット');
  assert.strictEqual(rows[1].category, 'インターネット');
  assert.strictEqual(rows[1].amount, 5724);
  assert.strictEqual(rows[1].note, 'メガ・エッグ');
  assert.strictEqual(rows[1].title, 'メガ・エッグ');

  // Row 3 (Income)
  assert.strictEqual(rows[2].date, '2022-02-15');
  assert.strictEqual(rows[2].type, 'income');
  assert.strictEqual(rows[2].amount, 249006);
  assert.strictEqual(rows[2].note, 'ゆういち');

  console.log('All CSV parser unit tests passed successfully!');
}

testParseHouseholdCsv();
