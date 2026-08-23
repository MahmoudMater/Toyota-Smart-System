import { createSession, handleInput, KioskState } from './state-machine';

const profile = {
  name: 'Ahmed Hassan',
  phone: '0501234567',
  plate: 'ABC 1234',
};

describe('kiosk state machine', () => {
  it('completes on yes at identity confirm', () => {
    const session = createSession({
      sessionId: 's1',
      gateId: 'gate-1',
      profile,
    });
    expect(session.state).toBe(KioskState.AwaitingIdentityConfirm);
    const outcome = handleInput(session, { source: 'touch', choice: 'yes' });
    expect(outcome.kind).toBe('completed');
    if (outcome.kind === 'completed') {
      expect(outcome.visitPhone).toBe('0501234567');
      expect(outcome.usedOnFilePhone).toBe(true);
      expect(outcome.session.state).toBe(KioskState.Done);
      expect(outcome.session.gateOpenStub).toBe(true);
    }
  });

  it('captures visit phone via owner path', () => {
    let session = createSession({
      sessionId: 's2',
      gateId: 'gate-1',
      profile,
    });
    let o = handleInput(session, { source: 'touch', choice: 'no' });
    expect(o.kind).toBe('continue');
    session = o.session;
    expect(session.state).toBe(KioskState.AwaitingOwnerCheck);

    o = handleInput(session, { source: 'touch', choice: 'yes' });
    session = o.session;
    expect(session.state).toBe(KioskState.AwaitingPhoneSpeech);

    o = handleInput(session, {
      source: 'touch',
      phone_digits: '0555123456',
    });
    session = o.session;
    expect(session.state).toBe(KioskState.AwaitingPhoneConfirm);

    o = handleInput(session, { source: 'touch', choice: 'yes' });
    expect(o.kind).toBe('completed');
    if (o.kind === 'completed') {
      expect(o.visitPhone).toBe('0555123456');
      expect(o.usedOnFilePhone).toBe(false);
    }
  });

  it('escalates after max unclear retries', () => {
    const session = createSession({
      sessionId: 's3',
      gateId: 'gate-1',
      profile,
    });
    handleInput(session, { source: 'touch', text: 'maybe' });
    handleInput(session, { source: 'touch', text: 'maybe' });
    const o = handleInput(session, { source: 'touch', text: 'maybe' });
    expect(o.kind).toBe('escalated');
    if (o.kind === 'escalated') {
      expect(o.reason).toBe('unclear_identity_confirm');
      expect(o.session.state).toBe(KioskState.StaffEscalation);
    }
  });

  it('escalates when not owner', () => {
    const session = createSession({
      sessionId: 's4',
      gateId: 'gate-1',
      profile,
    });
    handleInput(session, { source: 'touch', choice: 'no' });
    const o = handleInput(session, { source: 'touch', choice: 'no' });
    expect(o.kind).toBe('escalated');
    if (o.kind === 'escalated') {
      expect(o.reason).toBe('not_owner');
    }
  });
});
