export const CALCULATION_VERSION = 'body-os-3.1.0';
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function hydrationLiters(value: number, unit: 'L' | 'mL' | 'fl oz'): number {
  return unit === 'mL' ? value / 1000 : unit === 'fl oz' ? value * 0.0295735295625 : value;
}
export interface CalculationEvidence {
  version: string;
  kind: 'estimated' | 'insufficient-data';
  inputs: string[];
  missing: string[];
  sources?: string[];
}
