export function normalizeName(name?: string | null): string {
  if (!name) return '';
  return name.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}
