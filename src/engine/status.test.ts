import { describe, expect, it } from 'vitest';
import {
  applyStatus,
  clearStatus,
  decayStatuses,
  hasStatus,
  incomingDamageMult,
  outgoingDamageMult,
  statusStacks,
  tickDamageOverTime,
  tickHealOverTime,
  STATUS_DEFS,
  type StatusBag,
} from './status';

describe('applyStatus / clearStatus / hasStatus', () => {
  it('applies a fresh status', () => {
    const bag = applyStatus({}, 'burn', 3, 3);
    expect(bag.burn).toEqual({ stacks: 3, turnsRemaining: 3 });
    expect(hasStatus(bag, 'burn')).toBe(true);
  });

  it('stacks an existing status (sum stacks; max turns)', () => {
    let bag: StatusBag = applyStatus({}, 'burn', 3, 2);
    bag = applyStatus(bag, 'burn', 2, 5);
    expect(bag.burn).toEqual({ stacks: 5, turnsRemaining: 5 });
  });

  it('clearStatus removes the entry entirely', () => {
    const bag = applyStatus({}, 'frozen', 1, 1);
    const next = clearStatus(bag, 'frozen');
    expect(next.frozen).toBeUndefined();
    expect(hasStatus(next, 'frozen')).toBe(false);
  });

  it('hasStatus returns false for missing or zeroed effects', () => {
    expect(hasStatus({}, 'burn')).toBe(false);
    expect(hasStatus({ burn: { stacks: 0, turnsRemaining: 3 } }, 'burn')).toBe(false);
  });

  it('statusStacks returns 0 for absent', () => {
    expect(statusStacks({}, 'chill')).toBe(0);
    expect(statusStacks({ chill: { stacks: 4, turnsRemaining: 3 } }, 'chill')).toBe(4);
  });
});

describe('tickDamageOverTime', () => {
  it('Burn deals 3 per stack and decays by 1', () => {
    const bag = applyStatus({}, 'burn', 4, 3);
    const r = tickDamageOverTime(bag);
    expect(r.damage).toBe(12); // 3 * 4
    expect(r.bag.burn?.stacks).toBe(3);
  });

  it('Bleed deals 4 per stack and decays by 1', () => {
    const bag = applyStatus({}, 'bleed', 2, 2);
    const r = tickDamageOverTime(bag);
    expect(r.damage).toBe(8); // 4 * 2
    expect(r.bag.bleed?.stacks).toBe(1);
  });

  it('Burn + Bleed both tick simultaneously', () => {
    let bag: StatusBag = applyStatus({}, 'burn', 2, 3);
    bag = applyStatus(bag, 'bleed', 1, 2);
    const r = tickDamageOverTime(bag);
    expect(r.damage).toBe(2 * 3 + 1 * 4); // 6 + 4
  });

  it('returns 0 damage when no DoTs present', () => {
    const r = tickDamageOverTime({ marked: { stacks: 1, turnsRemaining: 2 } });
    expect(r.damage).toBe(0);
  });

  it('Burn at 1 stack ticks once then disappears', () => {
    const bag = applyStatus({}, 'burn', 1, 5);
    const r = tickDamageOverTime(bag);
    expect(r.damage).toBe(3);
    expect(r.bag.burn).toBeUndefined(); // 0 stacks → cleared
  });
});

describe('tickHealOverTime', () => {
  it('Regen heals 3 per stack', () => {
    const bag = applyStatus({}, 'regen', 4, 3);
    const r = tickHealOverTime(bag);
    expect(r.heal).toBe(12);
  });

  it('returns 0 with no regen', () => {
    expect(tickHealOverTime({}).heal).toBe(0);
  });
});

describe('decayStatuses', () => {
  it('decrements turnsRemaining for non-permanent effects', () => {
    const bag = applyStatus({}, 'marked', 1, 3);
    const next = decayStatuses(bag);
    expect(next.marked?.turnsRemaining).toBe(2);
  });

  it('drops effects whose turnsRemaining reaches 0', () => {
    const bag = applyStatus({}, 'weakened', 1, 1);
    const next = decayStatuses(bag);
    expect(next.weakened).toBeUndefined();
  });

  it('preserves permanent statuses (block) without decrementing', () => {
    const bag: StatusBag = { block: { stacks: 5, turnsRemaining: -1 } };
    const next = decayStatuses(bag);
    expect(next.block).toEqual({ stacks: 5, turnsRemaining: -1 });
  });

  it('preserves infinite-duration effects (turnsRemaining = -1)', () => {
    const bag: StatusBag = { hasted: { stacks: 1, turnsRemaining: -1 } };
    const next = decayStatuses(bag);
    expect(next.hasted).toEqual({ stacks: 1, turnsRemaining: -1 });
  });

  it('handles multiple effects independently', () => {
    let bag: StatusBag = applyStatus({}, 'marked', 1, 1);   // expires
    bag = applyStatus(bag, 'vulnerable', 1, 3);              // decrements
    bag = applyStatus(bag, 'burn', 5, 3);                    // decrements
    const next = decayStatuses(bag);
    expect(next.marked).toBeUndefined();
    expect(next.vulnerable?.turnsRemaining).toBe(2);
    expect(next.burn?.turnsRemaining).toBe(2);
    expect(next.burn?.stacks).toBe(5); // decay only touches turns, not stacks
  });
});

describe('outgoingDamageMult', () => {
  it('returns 1.0 with no statuses', () => {
    expect(outgoingDamageMult({})).toBe(1);
  });

  it('Weakened reduces damage to 0.75', () => {
    const bag = applyStatus({}, 'weakened', 1, 2);
    expect(outgoingDamageMult(bag)).toBe(0.75);
  });

  it('Burn does NOT reduce outgoing damage', () => {
    const bag = applyStatus({}, 'burn', 5, 3);
    expect(outgoingDamageMult(bag)).toBe(1);
  });
});

describe('incomingDamageMult', () => {
  it('returns 1.0 with no relevant statuses', () => {
    const r = incomingDamageMult({});
    expect(r.mult).toBe(1);
  });

  it('Marked adds 50%', () => {
    const bag = applyStatus({}, 'marked', 1, 2);
    expect(incomingDamageMult(bag).mult).toBe(1.5);
  });

  it('Vulnerable adds 50%', () => {
    const bag = applyStatus({}, 'vulnerable', 1, 2);
    expect(incomingDamageMult(bag).mult).toBe(1.5);
  });

  it('Marked + Vulnerable stack multiplicatively (1.5 × 1.5 = 2.25)', () => {
    let bag: StatusBag = applyStatus({}, 'marked', 1, 2);
    bag = applyStatus(bag, 'vulnerable', 1, 2);
    expect(incomingDamageMult(bag).mult).toBeCloseTo(2.25);
  });

  it('consumeMarked clears Marked but leaves Vulnerable', () => {
    let bag: StatusBag = applyStatus({}, 'marked', 1, 2);
    bag = applyStatus(bag, 'vulnerable', 1, 2);
    const r = incomingDamageMult(bag, { consumeMarked: true });
    expect(r.mult).toBeCloseTo(2.25);
    expect(hasStatus(r.bag, 'marked')).toBe(false);
    expect(hasStatus(r.bag, 'vulnerable')).toBe(true);
  });

  it('does not clear Marked when consumeMarked is false (default)', () => {
    const bag = applyStatus({}, 'marked', 1, 2);
    const r = incomingDamageMult(bag);
    expect(hasStatus(r.bag, 'marked')).toBe(true);
  });
});

describe('STATUS_DEFS', () => {
  it('covers all 11 status ids', () => {
    const ids = Object.keys(STATUS_DEFS);
    expect(ids).toHaveLength(11);
    expect(ids).toContain('burn');
    expect(ids).toContain('hasted');
  });

  it('every entry has icon + name', () => {
    for (const def of Object.values(STATUS_DEFS)) {
      expect(def.icon.length).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
    }
  });
});
