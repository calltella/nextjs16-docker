export interface CsvTransactionRow {
  date: string;
  type: string;
  paymentMethod?: string;
  parentCategory?: string;
  childCategory?: string;
  amount?: number;
  location?: string;
  memo?: string;
  note?: string;
  tag?: string;
}

/**
 * Splits CSV string into lines respecting quoted values with line breaks.
 */
function parseCsvLines(csvText: string): string[] {
  const lines: string[] = [];
  let currentLine = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      currentLine += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvText[i + 1] === '\n') {
        i++;
      }
      lines.push(currentLine);
      currentLine = '';
    } else {
      currentLine += char;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Splits a CSV line into fields respecting quoted values.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(field.trim());
      field = '';
    } else {
      field += char;
    }
  }
  fields.push(field.trim());
  return fields;
}

export function parseHouseholdCsv(csvText: string): CsvTransactionRow[] {
  const lines = parseCsvLines(csvText).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];

  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = parseCsvLine(headerLine);

  const colMap: Record<string, number> = {};
  headers.forEach((h, index) => {
    colMap[h] = index;
  });

  const getCol = (cols: string[], headerName: string): string => {
    const idx = colMap[headerName];
    return idx !== undefined && cols[idx] !== undefined ? cols[idx] : '';
  };

  const results: CsvTransactionRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const rawDate = getCol(cols, '日付');
    const rawType = getCol(cols, '収入/支出');
    const paymentMethod = getCol(cols, '入金/支払方法') || undefined;
    const parentCategory = getCol(cols, '親カテゴリ') || undefined;
    const childCategory = getCol(cols, '子カテゴリ') || undefined;
    const rawAmount = getCol(cols, '金額');
    const location = getCol(cols, '場所') || undefined;
    const memo = getCol(cols, 'メモ') || undefined;
    let note = getCol(cols, '備考') || undefined;
    let tag = getCol(cols, 'タグ') || undefined;

    // Handle extra trailing fields if header count is less than parsed columns
    const headerCount = headers.length;
    if (cols.length > headerCount) {
      const extraCols = cols.slice(headerCount - 1);
      if (colMap['備考'] === headerCount - 2) {
        note = extraCols.join(',');
      } else if (colMap['タグ'] === headerCount - 1) {
        tag = extraCols.join(',');
      }
    }

    if (!rawDate && !rawAmount && !rawType) continue;

    // Format date: "2022/01/07 00:00" or "2022/01/07" -> "2022-01-07"
    let dateStr = rawDate.split(' ')[0] || '';
    dateStr = dateStr.replace(/\//g, '-');

    const amount = rawAmount ? parseInt(rawAmount.replace(/,/g, ''), 10) : undefined;

    results.push({
      date: dateStr,
      type: rawType,
      paymentMethod,
      parentCategory,
      childCategory,
      amount: isNaN(amount as number) ? undefined : amount,
      location,
      memo,
      note,
      tag,
    });
  }

  return results;
}
