import {
  CHECKIN_KEYS,
  normalizeGate,
  normalizePlate,
  resolveSubmitPlate,
} from './checkin.logic';

describe('checkin.logic', () => {
  it('normalizes plates and gates', () => {
    expect(normalizePlate('  tkn  9001 ')).toBe('TKN 9001');
    expect(normalizeGate('')).toBe('gate-1');
    expect(normalizeGate(' gate-2 ')).toBe('gate-2');
  });

  it('locks plate from ticket when plateLocked', () => {
    expect(
      resolveSubmitPlate({
        clientPlate: 'HACK 000',
        ticketPlate: 'TKN 9001',
        plateLocked: true,
      }),
    ).toBe('TKN 9001');
  });

  it('allows client plate when not locked', () => {
    expect(
      resolveSubmitPlate({
        clientPlate: 'NEW 111',
        ticketPlate: 'TKN 9001',
        plateLocked: false,
      }),
    ).toBe('NEW 111');
  });

  it('uses settled redis key shapes', () => {
    expect(CHECKIN_KEYS.ticket('abc')).toBe('checkin:ticket:abc');
    expect(CHECKIN_KEYS.gate('gate-1')).toBe('checkin:gate:gate-1');
    expect(CHECKIN_KEYS.openRate('gate-1')).toBe('checkin:gate:open:gate-1');
  });
});
