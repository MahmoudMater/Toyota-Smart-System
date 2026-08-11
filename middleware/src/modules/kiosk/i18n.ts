export const DEFAULT_LANG = 'en';
export const ARABIC_ENABLED = false;
export const SUPPORTED = ARABIC_ENABLED
  ? new Set(['en', 'ar'])
  : new Set(['en']);

/** Plain display text for the screen + ElevenLabs v3 speech text. */
export interface Prompt {
  /** Plain text for the kiosk screen: no tashkeel, no audio tags. */
  display: string;
  /** ElevenLabs v3 input: audio tags, tashkeel, ellipses, spelled-out digits. */
  speech: string;
}

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

const AR_DIGIT_WORDS: Record<string, string> = {
  '0': 'صِفْر',
  '1': 'وَاحِد',
  '2': 'اِثْنَان',
  '3': 'ثَلَاثَة',
  '4': 'أَرْبَعَة',
  '5': 'خَمْسَة',
  '6': 'سِتَّة',
  '7': 'سَبْعَة',
  '8': 'ثَمَانِيَة',
  '9': 'تِسْعَة',
};

/** Group digits 3-3-4 (or leftover) for natural phone read-out. */
function chunkDigits(digits: string): string[] {
  if (digits.length <= 3) return [digits];
  if (digits.length <= 6) return [digits.slice(0, 3), digits.slice(3)];
  if (digits.length === 7) {
    return [digits.slice(0, 3), digits.slice(3)];
  }
  if (digits.length === 8) {
    return [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5)];
  }
  if (digits.length === 9) {
    return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
  }
  // 10+ → 3-3-rest (covers typical 10-digit Gulf numbers)
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)];
}

function speakPhone(phone: string, lang = 'en'): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return phone || '';
  const words = lang === 'ar' ? AR_DIGIT_WORDS : EN_DIGIT_WORDS;
  return chunkDigits(digits)
    .map((chunk) =>
      chunk
        .split('')
        .map((d) => words[d] ?? d)
        .join(' '),
    )
    .join(', ');
}

export function greeting(lang: string, name: string, plate: string): Prompt {
  if (lang === 'en') {
    return {
      display: `Al-Sayer Hayyak welcomes you. Hello ${name}. We found vehicle ${plate} on file.`,
      speech: `[warmly] Al-Sayer Hayyak welcomes you. ... Hello ${name}. ... We found vehicle ${plate} on file.`,
    };
  }
  return {
    display: `الساير حيّاك يرحب بكم. أهلاً ${name}. وجدنا المركبة ${plate} في النظام.`,
    speech: `[warmly]السَّايِر حَيَّاك يُرَحِّبُ بِكُم. ... أَهْلاً ${name}. ... وَجَدْنَا المَرْكَبَةَ ${plate} فِي النِّظَامِ.`,
  };
}

export function phoneConfirmQuestion(lang: string, phone: string): Prompt {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return {
      display: `The phone number on file is ${phone}. Is this your phone number?`,
      speech: `[speaking clearly] The phone number on file is ${spoken}. ... Is this your phone number?`,
    };
  }
  return {
    display: `رقم الجوال المسجّل هو ${phone}. هل هذا رقمك؟`,
    speech: `[speaking clearly]رَقْمُ الجَوَّالِ المُسَجَّلُ هُوَ ${spoken}. ... هَلْ هَذَا رَقْمُكَ؟`,
  };
}

export function phoneConfirmRetry(lang: string, phone: string): Prompt {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return {
      display: `Sorry, I didn't catch that. Is ${phone} your phone number? Please say yes or no.`,
      speech: `[apologetic] Sorry, I didn't catch that. ... Is ${spoken} your phone number? Please say YES or NO.`,
    };
  }
  return {
    display: `عذراً، لم أفهم. هل ${phone} هو رقمك؟ من فضلك قل نعم أو لا.`,
    speech: `[apologetic]عُذْراً، لَمْ أَفْهَمْ. ... هَلْ ${spoken} هُوَ رَقْمُكَ؟ مِنْ فَضْلِكَ قُلْ نَعَمْ أَوْ لَا.`,
  };
}

export function ownerCheck(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display: 'Are you the owner of this vehicle?',
      speech: '[speaking clearly] Are you the owner of this vehicle?',
    };
  }
  return {
    display: 'هل أنت مالك هذه المركبة؟',
    speech: '[speaking clearly]هَلْ أَنْتَ مَالِكُ هَذِهِ المَرْكَبَةِ؟',
  };
}

export function ownerCheckRetry(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display: 'Are you the owner of this vehicle? Please say yes or no.',
      speech:
        '[apologetic] Are you the owner of this vehicle? ... Please say YES or NO.',
    };
  }
  return {
    display: 'هل أنت مالك هذه المركبة؟ من فضلك قل نعم أو لا.',
    speech:
      '[apologetic]هَلْ أَنْتَ مَالِكُ هَذِهِ المَرْكَبَةِ؟ ... مِنْ فَضْلِكَ قُلْ نَعَمْ أَوْ لَا.',
  };
}

export function askPhone(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display:
        'Please say or enter the phone number we should use for this visit.',
      speech:
        '[speaking clearly] Please say or enter the phone number we should use for this visit.',
    };
  }
  return {
    display: 'من فضلك قل أو أدخل رقم الجوال الذي نستخدمه لهذه الزيارة.',
    speech:
      '[speaking clearly]مِنْ فَضْلِكَ قُلْ أَوْ أَدْخِلْ رَقْمَ الجَوَّالِ الَّذِي نَسْتَخْدِمُهُ لِهَذِهِ الزِّيَارَةِ.',
  };
}

export function phoneHeardConfirm(lang: string, phone: string): Prompt {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return {
      display: `I heard ${phone}. Is that correct?`,
      speech: `[speaking clearly] I heard ${spoken}. ... Is that correct?`,
    };
  }
  return {
    display: `سمعت الرقم ${phone}. هل هذا صحيح؟`,
    speech: `[speaking clearly]سَمِعْتُ الرَّقْمَ ${spoken}. ... هَلْ هَذَا صَحِيحٌ؟`,
  };
}

export function phoneUnclear(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display:
        "I didn't get a clear phone number. Please say the digits slowly, or use the keypad.",
      speech:
        "[apologetic] I didn't get a clear phone number. ... Please say the digits slowly, or use the keypad.",
    };
  }
  return {
    display:
      'لم ألتقط رقماً واضحاً. من فضلك قل الأرقام ببطء أو استخدم لوحة الأرقام.',
    speech:
      '[apologetic]لَمْ أَلْتَقِطْ رَقْماً وَاضِحاً. ... مِنْ فَضْلِكَ قُلِ الأَرْقَامَ بِبُطْءٍ أَوِ اسْتَخْدِمْ لَوْحَةَ الأَرْقَامِ.',
  };
}

export function phoneAgain(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display: 'Okay. Please say or enter the phone number again.',
      speech:
        '[speaking clearly] Okay. ... Please say or enter the phone number again.',
    };
  }
  return {
    display: 'حسناً. من فضلك قل أو أدخل رقم الجوال مرة أخرى.',
    speech:
      '[speaking clearly]حَسَناً. ... مِنْ فَضْلِكَ قُلْ أَوْ أَدْخِلْ رَقْمَ الجَوَّالِ مَرَّةً أُخْرَى.',
  };
}

export function phoneConfirmAgain(lang: string, phone: string): Prompt {
  const spoken = speakPhone(phone, lang);
  if (lang === 'en') {
    return {
      display: `Please confirm: is ${phone} correct? Say yes or no.`,
      speech: `[speaking clearly] Please confirm: is ${spoken} correct? ... Say YES or NO.`,
    };
  }
  return {
    display: `للتأكيد: هل ${phone} صحيح؟ قل نعم أو لا.`,
    speech: `[speaking clearly]لِلتَّأْكِيدِ: هَلْ ${spoken} صَحِيحٌ؟ ... قُلْ نَعَمْ أَوْ لَا.`,
  };
}

export function done(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display:
        'Thank you. Opening the gate now. You have been added to the queue. Have a great visit.',
      speech:
        '[professional] Thank you. ... Opening the gate now. ... You have been added to the queue. Have a great visit.',
    };
  }
  return {
    display:
      'شكراً لك. سيتم فتح البوابة الآن. تمت إضافتك إلى قائمة الانتظار. نتمنى لك زيارة طيبة.',
    speech:
      '[professional]شُكْراً لَكَ. ... سَيَتِمُّ فَتْحُ البَوَّابَةِ الآنَ. ... تَمَّتْ إِضَافَتُكَ إِلَى قَائِمَةِ الِانْتِظَارِ. نَتَمَنَّى لَكَ زِيَارَةً طَيِّبَةً.',
  };
}

export function escalate(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display:
        "I'm having trouble confirming your details. Please wait — a staff member will assist you shortly.",
      speech:
        "[reassuring] I'm having trouble confirming your details. ... Please wait — a staff member will assist you shortly.",
    };
  }
  return {
    display:
      'أواجه صعوبة في تأكيد بياناتك. من فضلك انتظر — سيقوم أحد الموظفين بمساعدتك قريباً.',
    speech:
      '[reassuring]أُوَاجِهُ صُعُوبَةً فِي تَأْكِيدِ بَيَانَاتِكَ. ... مِنْ فَضْلِكَ انْتَظِرْ — سَيَقُومُ أَحَدُ المُوَظَّفِينَ بِمُسَاعَدَتِكَ قَرِيباً.',
  };
}

export function notRecognized(lang: string): Prompt {
  if (lang === 'en') {
    return {
      display: 'Vehicle not recognized. Please see staff for assistance.',
      speech:
        '[professional] Vehicle not recognized. ... Please see staff for assistance.',
    };
  }
  return {
    display: 'المركبة غير معروفة. من فضلك راجع الموظف.',
    speech:
      '[professional]المَرْكَبَةُ غَيْرُ مَعْرُوفَةٍ. ... مِنْ فَضْلِكَ رَاجِعِ المُوَظَّفَ.',
  };
}
