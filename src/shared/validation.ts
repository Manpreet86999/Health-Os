export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : value == null ? fallback : String(value).trim();
}

export function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function asDate(value: unknown, fallback = new Date().toISOString().slice(0, 10)): string {
  const date = asString(value, fallback).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : fallback;
}

export function requireNonEmpty(value: unknown, label: string): string {
  const result = asString(value);
  if (!result) throw new Error(`${label} is required.`);
  return result;
}
