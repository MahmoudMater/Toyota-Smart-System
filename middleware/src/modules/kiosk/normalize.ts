const YES_WORDS = new Set([
  'yes',
  'yeah',
  'yep',
  'yup',
  'ya',
  'yea',
  'sure',
  'correct',
  'affirmative',
  'ok',
  'okay',
  'right',
  'true',
  'نعم',
  'ايوه',
  'أيوه',
  'ايوة',
  'أيوة',
  'اه',
  'آه',
  'صح',
  'موافق',
  'تمام',
]);

const NO_WORDS = new Set([
  'no',
  'nope',
  'nah',
  'naw',
  'negative',
  'incorrect',
  'wrong',
  'false',
  'لا',
  'لأ',
  'لاء',
  'مش',
  'مو',
]);

const WORD_NUMBERS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  صفر: '0',
  واحد: '1',
  اثنين: '2',
  اتنين: '2',
  ثنين: '2',
  ثلاثة: '3',
  ثلاثه: '3',
  تلاتة: '3',
  تلاته: '3',
  اربعة: '4',
  أربعة: '4',
  اربعه: '4',
  أربعه: '4',
  خمسة: '5',
  خمسه: '5',
  ستة: '6',
  سته: '6',
  سبعة: '7',
  سبعه: '7',
  ثمانية: '8',
  ثمانيه: '8',
  تمانية: '8',
  تسعة: '9',
  تسعه: '9',
};

const ARABIC_INDIC =
  '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.split('');
const ASCII_DIGITS = '01234567890123456789'.split('');

function fold(text: string): string {
  let out = (text || '').normalize('NFC').trim();
  for (let i = 0; i < ARABIC_INDIC.length; i++) {
    out = out.split(ARABIC_INDIC[i]).join(ASCII_DIGITS[i]);
  }
  return out;
}

function tokenize(text: string): string[] {
  return fold(text)
    .toLowerCase()
    .replace(/[^\w\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function extractDigits(text: string): string {
  const digits: string[] = [];
  for (const token of tokenize(text)) {
    if (/^\d+$/.test(token)) {
      digits.push(...token.split(''));
      continue;
    }
    const mapped = WORD_NUMBERS[token];
    if (mapped !== undefined) {
      digits.push(mapped);
      continue;
    }
    const embedded = token.match(/\d/g);
    if (embedded) digits.push(...embedded);
  }
  return digits.join('');
}

export function normalizeYesNo(text: string): 'yes' | 'no' | null {
  const tokens = tokenize(text);
  const raw = fold(text);
  if (!tokens.length && !raw) return null;

  const joined = tokens.join(' ');
  if (YES_WORDS.has(joined) || YES_WORDS.has(raw)) return 'yes';
  if (NO_WORDS.has(joined) || NO_WORDS.has(raw)) return 'no';

  const hasYes = tokens.some((t) => YES_WORDS.has(t));
  const hasNo = tokens.some((t) => NO_WORDS.has(t));
  if (hasYes && !hasNo) return 'yes';
  if (hasNo && !hasYes) return 'no';
  return null;
}

export function normalizeTranscript(text: string): {
  text: string;
  normalized: 'yes' | 'no' | 'digits' | null;
  digits: string | null;
} {
  const raw = fold(text);
  const yesNo = normalizeYesNo(raw);
  const digits = extractDigits(raw);
  if (yesNo) return { text: raw, normalized: yesNo, digits: digits || null };
  if (digits) return { text: raw, normalized: 'digits', digits };
  return { text: raw, normalized: null, digits: null };
}
