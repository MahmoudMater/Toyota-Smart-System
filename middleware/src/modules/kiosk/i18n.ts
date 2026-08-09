export const DEFAULT_LANG = 'en';
export const ARABIC_ENABLED = false;
export const SUPPORTED = ARABIC_ENABLED
  ? new Set(['en', 'ar'])
  : new Set(['en']);

const EN_DIGIT_WORDS: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
};

function speakPhone(phone: string, lang = 'en'): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return phone || '';
  return digits
    .split('')
    .map((d) => EN_DIGIT_WORDS[d] ?? d)
    .join(', ');
}

export function greeting(lang: string, name: string, plate: string): string {
  if (lang === 'en') {
    return `Welcome to Toyota. Hello ${name}. We found vehicle ${plate} on file.`;
  }
  return `مرحباً بك في تويوتا. أهلاً ${name}. وجدنا المركبة ${plate} في النظام.`;
}

export function phoneConfirmQuestion(lang: string, phone: string): string {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return `The phone number on file is ${spoken}. Is this your phone number?`;
  }
  return `رقم الجوال المسجّل هو ${spoken}. هل هذا رقمك؟`;
}

export function phoneConfirmRetry(lang: string, phone: string): string {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return `Sorry, I didn't catch that. Is ${spoken} your phone number? Please say yes or no.`;
  }
  return `عذراً، لم أفهم. هل ${spoken} هو رقمك؟ من فضلك قل نعم أو لا.`;
}

export function ownerCheck(lang: string): string {
  return lang === 'en'
    ? 'Are you the owner of this vehicle?'
    : 'هل أنت مالك هذه المركبة؟';
}

export function ownerCheckRetry(lang: string): string {
  return lang === 'en'
    ? 'Are you the owner of this vehicle? Please say yes or no.'
    : 'هل أنت مالك هذه المركبة؟ من فضلك قل نعم أو لا.';
}

export function askPhone(lang: string): string {
  return lang === 'en'
    ? 'Please say or enter the phone number we should use for this visit.'
    : 'من فضلك قل أو أدخل رقم الجوال الذي نستخدمه لهذه الزيارة.';
}

export function phoneHeardConfirm(lang: string, phone: string): string {
  const spoken = speakPhone(phone, lang);
  return lang === 'en'
    ? `I heard ${spoken}. Is that correct?`
    : `سمعت الرقم ${spoken}. هل هذا صحيح؟`;
}

export function phoneUnclear(lang: string): string {
  return lang === 'en'
    ? "I didn't get a clear phone number. Please say the digits slowly, or use the keypad."
    : 'لم ألتقط رقماً واضحاً. من فضلك قل الأرقام ببطء أو استخدم لوحة الأرقام.';
}

export function phoneAgain(lang: string): string {
  return lang === 'en'
    ? 'Okay. Please say or enter the phone number again.'
    : 'حسناً. من فضلك قل أو أدخل رقم الجوال مرة أخرى.';
}

export function phoneConfirmAgain(lang: string, phone: string): string {
  const spoken = speakPhone(phone, lang);
  return lang === 'en'
    ? `Please confirm: is ${spoken} correct? Say yes or no.`
    : `للتأكيد: هل ${spoken} صحيح؟ قل نعم أو لا.`;
}

export function done(lang: string): string {
  return lang === 'en'
    ? 'Thank you. Opening the gate now. You have been added to the queue. Have a great visit.'
    : 'شكراً لك. سيتم فتح البوابة الآن. تمت إضافتك إلى قائمة الانتظار. نتمنى لك زيارة طيبة.';
}

export function escalate(lang: string): string {
  return lang === 'en'
    ? "I'm having trouble confirming your details. Please wait — a staff member will assist you shortly."
    : 'أواجه صعوبة في تأكيد بياناتك. من فضلك انتظر — سيقوم أحد الموظفين بمساعدتك قريباً.';
}

export function notRecognized(lang: string): string {
  return lang === 'en'
    ? 'Vehicle not recognized. Please see staff for assistance.'
    : 'المركبة غير معروفة. من فضلك راجع الموظف.';
}
