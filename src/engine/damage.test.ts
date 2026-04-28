import { describe, expect, it } from 'vitest';
import { computeDamage, resistanceFor, DAMAGE_TYPES } from './damage';

const baseInput = {
  raw: 10,
  type: 'steel' as const,
  attackerAtk: 0,
  attackerCritChance: 0,
  defenderDef: 0,
  defenderBlock: 0,
  critRoll: 0.5,
};

describe('computeDamage — basic flow', () => {
  it('passes raw damage straight to HP when no def, no block, no crit, neutral resist', () => {
    const r = computeDamage({ ...baseInput, raw: 12 });
    expect(r.hpDelta).toBe(12);
    expect(r.blockConsumed).toBe(0);
    expect(r.wasCrit).toBe(false);
    expect(r.finalDamage).toBe(12);
  });

  it('attacker Atk adds flat bonus before crit/resist', () => {
    const r = computeDamage({ ...baseInput, raw: 10, attackerAtk: 5 });
    expect(r.finalDamage).toBe(15);
    expect(r.hpDelta).toBe(15);
  });

  it('block absorbs first; excess block is wasted', () => {
    const r = computeDamage({ ...baseInput, raw: 10, defenderBlock: 6 });
    expect(r.blockConsumed).toBe(6);
    expect(r.hpDelta).toBe(4);
  });

  it('block fully absorbs when block ≥ damage', () => {
    const r = computeDamage({ ...baseInput, raw: 5, defenderBlock: 20 });
    expect(r.blockConsumed).toBe(5);
    expect(r.hpDelta).toBe(0);
  });

  it('defense applies after block, floor at 0', () => {
    const r = computeDamage({ ...baseInput, raw: 10, defenderBlock: 4, defenderDef: 3 });
    // 10 dmg - 4 block = 6, then -3 def = 3 hp
    expect(r.blockConsumed).toBe(4);
    expect(r.hpDelta).toBe(3);
  });

  it('massive defense cannot make hpDelta negative', () => {
    const r = computeDamage({ ...baseInput, raw: 5, defenderDef: 100 });
    expect(r.hpDelta).toBe(0);
  });
});

describe('computeDamage — crits', () => {
  it('crit fires when critRoll < critChance', () => {
    const r = computeDamage({ ...baseInput, raw: 10, attackerCritChance: 0.5, critRoll: 0.1 });
    expect(r.wasCrit).toBe(true);
    expect(r.finalDamage).toBe(15); // 10 * 1.5
    expect(r.hpDelta).toBe(15);
  });

  it('no crit when critRoll >= critChance', () => {
    const r = computeDamage({ ...baseInput, raw: 10, attackerCritChance: 0.5, critRoll: 0.5 });
    expect(r.wasCrit).toBe(false);
    expect(r.finalDamage).toBe(10);
  });

  it('zero crit chance never crits even with critRoll = 0', () => {
    const r = computeDamage({ ...baseInput, raw: 10, attackerCritChance: 0, critRoll: 0 });
    expect(r.wasCrit).toBe(false);
  });

  it('custom crit bonus multiplier', () => {
    const r = computeDamage({ ...baseInput, raw: 10, attackerCritChance: 1, attackerCritBonus: 2, critRoll: 0 });
    expect(r.finalDamage).toBe(20);
  });

  it('crit applies before resistances', () => {
    // 10 raw * 1.5 crit * 0.5 resist = 7.5 → rounds to 8
    const r = computeDamage({
      ...baseInput,
      raw: 10,
      attackerCritChance: 1,
      critRoll: 0,
      defenderResistances: { steel: 0.5 },
    });
    expect(r.finalDamage).toBe(8);
  });
});

describe('computeDamage — resistances', () => {
  it('halves damage with 0.5 resistance', () => {
    const r = computeDamage({
      ...baseInput,
      raw: 20,
      type: 'pyre',
      defenderResistances: { pyre: 0.5 },
    });
    expect(r.finalDamage).toBe(10);
    expect(r.hpDelta).toBe(10);
  });

  it('doubles damage with 2.0 vulnerability', () => {
    const r = computeDamage({
      ...baseInput,
      raw: 10,
      type: 'frost',
      defenderResistances: { frost: 2.0 },
    });
    expect(r.finalDamage).toBe(20);
  });

  it('immune to a type with 0 resistance', () => {
    const r = computeDamage({
      ...baseInput,
      raw: 50,
      type: 'arcane',
      defenderResistances: { arcane: 0 },
    });
    expect(r.finalDamage).toBe(0);
    expect(r.hpDelta).toBe(0);
  });

  it('only the matching damage type resistance applies', () => {
    const r = computeDamage({
      ...baseInput,
      raw: 10,
      type: 'pyre',
      defenderResistances: { frost: 0.5 }, // doesnt match
    });
    expect(r.finalDamage).toBe(10);
  });
});

describe('computeDamage — block piercing', () => {
  it('block piercing 0.5 ignores half the block', () => {
    // 10 dmg, 8 block, piercing 0.5 → effective block = 4 → hpDelta = 6
    const r = computeDamage({ ...baseInput, raw: 10, defenderBlock: 8, blockPiercing: 0.5 });
    expect(r.blockConsumed).toBe(4);
    expect(r.hpDelta).toBe(6);
  });

  it('block piercing 1.0 ignores all block (Reality Tear behaviour)', () => {
    const r = computeDamage({ ...baseInput, raw: 25, defenderBlock: 100, blockPiercing: 1 });
    expect(r.blockConsumed).toBe(0);
    expect(r.hpDelta).toBe(25);
  });

  it('block piercing > 1 clamps to full pierce', () => {
    const r = computeDamage({ ...baseInput, raw: 10, defenderBlock: 5, blockPiercing: 999 });
    expect(r.blockConsumed).toBe(0);
    expect(r.hpDelta).toBe(10);
  });
});

describe('computeDamage — GDD worked example', () => {
  it('Cleaving Strike (18 Steel) into 8 block + 2 def → 8 to HP', () => {
    // 18 raw → 8 block consumed, 10 left → -2 def = 8 hp
    const r = computeDamage({
      ...baseInput,
      raw: 18,
      type: 'steel',
      defenderBlock: 8,
      defenderDef: 2,
    });
    expect(r.blockConsumed).toBe(8);
    expect(r.hpDelta).toBe(8);
  });

  it('Pyre vs Drakehide Plate (50% Pyre resist, 8 def) → 5 from a 16-dmg Phoenix Blast', () => {
    // 16 * 0.5 = 8, -8 def = 0  -> blocked entirely by def
    const r = computeDamage({
      ...baseInput,
      raw: 16,
      type: 'pyre',
      defenderDef: 8,
      defenderResistances: { pyre: 0.5 },
    });
    expect(r.finalDamage).toBe(8);
    expect(r.hpDelta).toBe(0);
  });
});

describe('resistanceFor + DAMAGE_TYPES', () => {
  it('returns 1.0 when resistances is undefined', () => {
    expect(resistanceFor(undefined, 'steel')).toBe(1);
  });

  it('returns 1.0 for unspecified type', () => {
    expect(resistanceFor({ pyre: 0.5 }, 'frost')).toBe(1);
  });

  it('returns the configured value', () => {
    expect(resistanceFor({ frost: 0.25 }, 'frost')).toBe(0.25);
  });

  it('DAMAGE_TYPES enumerates exactly the 5 GDD types', () => {
    expect(DAMAGE_TYPES).toEqual(['steel', 'pierce', 'pyre', 'frost', 'arcane']);
    expect(DAMAGE_TYPES).toHaveLength(5);
  });
});
