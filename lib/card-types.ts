export interface TransactionPaymentSource {
  paymentMethod?: string | null;
}

export interface ExistingCardType {
  name: string;
  paymentMethod?: string | null;
}

/**
 * Extracts distinct non-empty paymentMethod values from transaction records.
 */
export function extractUniquePaymentMethods(
  transactions: TransactionPaymentSource[]
): string[] {
  const methodsSet = new Set<string>();
  for (const item of transactions) {
    if (item.paymentMethod && item.paymentMethod.trim() !== '') {
      methodsSet.add(item.paymentMethod.trim());
    }
  }
  return Array.from(methodsSet);
}

/**
 * Filters out payment methods that are already registered as a card type or matching name.
 */
export function filterNewPaymentMethods(
  uniquePaymentMethods: string[],
  existingCardTypes: ExistingCardType[]
): string[] {
  const existingMethods = new Set(
    existingCardTypes
      .map((c) => c.paymentMethod?.trim())
      .filter((pm): pm is string => Boolean(pm))
  );
  const existingNames = new Set(existingCardTypes.map((c) => c.name.trim()));

  return uniquePaymentMethods.filter(
    (pm) => !existingMethods.has(pm) && !existingNames.has(pm)
  );
}
