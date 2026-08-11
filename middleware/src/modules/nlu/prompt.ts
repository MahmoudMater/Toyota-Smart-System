/**
 * Slim prompt — fewer tokens = lower prefill latency on the socket path.
 * Accuracy need not be perfect; AwaitingPhoneConfirm reads digits back.
 */
export const NLU_SYSTEM_PROMPT = `Extract kiosk speech intent as JSON only.
Phone: final digits only after corrections ("no no", "sorry", "I mean"). oh between digits = 0. double X = XX. triple X = XXX.
Strip +20/0020 and +966/00966 to local (keep leading 0).
yes/yeah/نعم/ايوه → yes. no/لا/مش → no. Empty/nonsense → nulls.
{"intent":"yes"|"no"|"digits"|null,"digits":string|null}`;

export const NLU_FEW_SHOT: { role: 'user' | 'assistant'; content: string }[] = [
  {
    role: 'user',
    content:
      'ummm my phone number is zero one five five five zero three oh no no two nine nine',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"01555032099"}',
  },
  {
    role: 'user',
    content: 'plus nine six six five five five one two three four five six',
  },
  {
    role: 'assistant',
    content: '{"intent":"digits","digits":"0555123456"}',
  },
  {
    role: 'user',
    content: 'yeah',
  },
  {
    role: 'assistant',
    content: '{"intent":"yes","digits":null}',
  },
];

export const NLU_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    intent: {
      type: ['string', 'null'] as string[],
      enum: ['yes', 'no', 'digits', null],
    },
    digits: {
      type: ['string', 'null'] as string[],
      description: 'Extracted phone digits or null',
    },
  },
  required: ['intent', 'digits'] as string[],
  additionalProperties: false,
};
