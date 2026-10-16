/** Cloud and older cached records can contain a structured label in a text field.
 * Render only its readable label, never the object or its identifiers. */
export function displayText(value: unknown, fallback = '', depth = 0): string {
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth >= 3) return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ['label', 'title', 'name', 'text', 'recommendation']) {
    const text = displayText(record[key], '', depth + 1);
    if (text) return text;
  }
  return fallback;
}
