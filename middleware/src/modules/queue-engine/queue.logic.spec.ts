import { applyShiftBack, nextShiftDistance } from './queue.logic';

describe('queue.logic shift-back', () => {
  it('pushes first miss back 1 position', () => {
    const ids = ['1', '2', '3', '4'];
    const distance = nextShiftDistance(0);
    expect(distance).toBe(1);
    const { next, newPosition } = applyShiftBack(ids, '1', distance);
    expect(next).toEqual(['2', '1', '3', '4']);
    expect(newPosition).toBe(1);
  });

  it('pushes second miss back 2 positions (design walkthrough)', () => {
    // After first miss: [2, 1, 3, 4]; 2 times out with consecutiveMisses=1 → push 2
    const ids = ['2', '1', '3', '4'];
    const distance = nextShiftDistance(1);
    expect(distance).toBe(2);
    const { next, newPosition } = applyShiftBack(ids, '2', distance);
    expect(next).toEqual(['1', '3', '2', '4']);
    expect(newPosition).toBe(2);
  });

  it('clamps insert to end of list', () => {
    const { next, newPosition } = applyShiftBack(['a', 'b'], 'a', 10);
    expect(next).toEqual(['b', 'a']);
    expect(newPosition).toBe(1);
  });

  it('no-ops when entry missing', () => {
    const { next, newPosition } = applyShiftBack(['a', 'b'], 'z', 1);
    expect(next).toEqual(['a', 'b']);
    expect(newPosition).toBe(-1);
  });
});
