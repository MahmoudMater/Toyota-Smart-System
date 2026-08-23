/**
 * Phone number normalization and validation for Egyptian and Saudi mobile numbers.
 *
 * Egyptian: 11 digits, prefixes 010 / 011 / 012 / 015
 * Saudi:    10 digits, prefix 05x
 *
 * Strips international prefixes (+20, 0020, +966, 00966) to local form before validation.
 */

export type PhoneRegion = 'EG' | 'SA';

export interface PhoneValidationResult {
  valid: boolean;
  region: PhoneRegion | null;
  local: string | null;
}

const EG_PREFIXES = ['010', '011', '012', '015'];
const SA_PREFIX = '05';

function stripToDigits(input: string): string {
  return input.replace(/\D/g, '');
}

function stripCountryCode(digits: string): {
  stripped: string;
  hint: PhoneRegion | null;
} {
  // +20 / 0020 → Egypt
  if (digits.startsWith('20') && digits.length === 12) {
    return { stripped: '0' + digits.slice(2), hint: 'EG' };
  }
  if (digits.startsWith('0020') && digits.length === 14) {
    return { stripped: '0' + digits.slice(4), hint: 'EG' };
  }

  // +966 / 00966 → Saudi
  if (digits.startsWith('966') && digits.length === 12) {
    return { stripped: '0' + digits.slice(3), hint: 'SA' };
  }
  if (digits.startsWith('00966') && digits.length === 14) {
    return { stripped: '0' + digits.slice(5), hint: 'SA' };
  }

  return { stripped: digits, hint: null };
}

function isValidEgyptian(local: string): boolean {
  return local.length === 11 && EG_PREFIXES.some((p) => local.startsWith(p));
}

function isValidSaudi(local: string): boolean {
  return local.length === 10 && local.startsWith(SA_PREFIX);
}

export function validatePhone(
  input: string,
  regions: PhoneRegion[] = ['EG', 'SA'],
): PhoneValidationResult {
  const raw = stripToDigits(input);
  if (!raw) return { valid: false, region: null, local: null };

  const { stripped, hint } = stripCountryCode(raw);

  if (regions.includes('EG') && isValidEgyptian(stripped)) {
    return { valid: true, region: 'EG', local: stripped };
  }
  if (regions.includes('SA') && isValidSaudi(stripped)) {
    return { valid: true, region: 'SA', local: stripped };
  }

  // If country-code stripping gave a hint but validation failed, still invalid
  if (hint) return { valid: false, region: hint, local: stripped };

  return { valid: false, region: null, local: stripped };
}

export function parseRegions(csv: string): PhoneRegion[] {
  return csv
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is PhoneRegion => s === 'EG' || s === 'SA');
}
