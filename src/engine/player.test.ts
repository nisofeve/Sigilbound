import { describe, expect, it } from 'vitest';
import {
  addBlock,
  applyPlayerStatus,
  baseStatsForLevel,
  clearBlock,
  computePlayerStats,
  healPlayer,
  isAlive,
  newCombatant,
  takePlayerDamage,
  tickEndOfPlayerTurn,
  type PlayerStats,
  type StatModifier,
} from './player';

describe('baseStatsForLevel', () => {
  it('level 1: 50 HP, 0 atk, 5% crit, 3 stamina, 3 sigil slots, 5 hand', () => {
    const s = baseStatsForLevel(1);
    expect(s.maxHp).toBe(50);
    expect(s.atk).toBe(0);
    expect(s.def).toBe(0);
    expect(s.critChance).toBe(0.05);
    expect(s.stamina).toBe(3);
    expect(s.sigilSlots).toBe(3);
    expect(s.handSize).toBe(5);
  });

  it('level 50: clamps within GDD ranges', () => {
    const s = baseStatsForLevel(50);
    expect(s.maxHp).toBe(50 + 49 * 4);   // 246
    expect(s.atk).toBe(Math.floor(49 * 0.6)); // 29
  });

  it('level out-of-range clamps to [1, 50]', () => {
    expect(baseStatsForLevel(0).maxHp).toBe(50);
    expect(baseStatsForLevel(999).maxHp).toBe(baseStatsForLevel(50).maxHp);
    expect(baseStatsForLevel(-5).maxHp).toBe(50);
  });

  it('non-integer levels floor', () => {
    expect(baseStatsForLevel(3.7).maxHp).toBe(baseStatsForLevel(3).maxHp);
  });
});

describe('computePlayerStats', () => {
  it('no modifiers returns base stats', () => {
    const s = computePlayerStats({ level: 1, modifiers: [] });
    expect(s).toEqual(baseStatsForLevel(1));
  });

  it('sums flat modifiers across pieces', () => {
    const mods: StatModifier[] = [
      { maxHp: 15, atk: 4 },                    // helm
      { maxHp: 40, def: 8 },                    // armor
      { critChance: 0.05, atk: 2 },             // ring
    ];
    const s = computePlayerStats({ level: 1, modifiers: mods });
    expect(s.maxHp).toBe(50 + 15 + 40);
    expect(s.atk).toBe(0 + 4 + 2);
    expect(s.def).toBe(8);
    expect(s.critChance).toBeCloseTo(0.10);
  });

  it('clamps critChance to [0,1]', () => {
    const s = computePlayerStats({ level: 1, modifiers: [{ critChance: 5 }] });
    expect(s.critChance).toBe(1);
  });

  it('clamps sigilSlots to [1,6]', () => {
    const s = computePlayerStats({ level: 1, modifiers: [{ sigilSlots: 99 }] });
    expect(s.sigilSlots).toBe(6);
  });

  it('Heart of the Sigilkeeper amulet: +1 sigil slot stacks with talent', () => {
    const s = computePlayerStats({
      level: 1,
      modifiers: [
        { sigilSlots: 1 }, // Heart of the Sigilkeeper amulet
        { sigilSlots: 1 }, // Extra Sigil talent
      ],
    });
    expect(s.sigilSlots).toBe(5); // base 3 + 2
  });

  it('resistances multiply (not add)', () => {
    // Two pieces with 0.5 resist each → effective 0.25 (compound).
    const s = computePlayerStats({
      level: 1,
      modifiers: [
        { resistances: { pyre: 0.5 } },
        { resistances: { pyre: 0.5 } },
      ],
    });
    expect(s.resistances.pyre).toBe(0.25);
  });

  it('different damage type resistances stay independent', () => {
    const s = computePlayerStats({
      level: 1,
      modifiers: [{ resistances: { pyre: 0.5, frost: 0.75 } }],
    });
    expect(s.resistances.pyre).toBe(0.5);
    expect(s.resistances.frost).toBe(0.75);
    expect(s.resistances.steel).toBeUndefined();
  });

  it('maxHp floors at 1', () => {
    const s = computePlayerStats({ level: 1, modifiers: [{ maxHp: -1000 }] });
    expect(s.maxHp).toBe(1);
  });
});

describe('PlayerCombatant lifecycle', () => {
  const stats: PlayerStats = baseStatsForLevel(10);

  it('newCombatant starts at full HP, no block, no statuses', () => {
    const c = newCombatant(stats);
    expect(c.currentHp).toBe(stats.maxHp);
    expect(c.block).toBe(0);
    expect(c.statuses).toEqual({});
    expect(c.damageTakenThisStage).toBe(0);
  });

  it('takePlayerDamage applies block then def then HP', () => {
    let c = newCombatant({ ...stats, def: 2 });
    c = addBlock(c, 5);
    const { combatant, result } = takePlayerDamage(c, { raw: 12, type: 'steel' });
    // 12 raw - 5 block = 7, -2 def = 5
    expect(result.blockConsumed).toBe(5);
    expect(result.hpDelta).toBe(5);
    expect(combatant.block).toBe(0);
    expect(combatant.currentHp).toBe(stats.maxHp - 5);
    expect(combatant.damageTakenThisStage).toBe(5);
  });

  it('healPlayer caps at maxHp', () => {
    let c = newCombatant(stats);
    c = takePlayerDamage(c, { raw: 20, type: 'steel' }).combatant;
    const healed = healPlayer(c, 9999);
    expect(healed.currentHp).toBe(stats.maxHp);
  });

  it('healPlayer with 0 amount is a no-op', () => {
    const c = newCombatant(stats);
    expect(healPlayer(c, 0)).toBe(c);
  });

  it('clearBlock resets block to 0', () => {
    let c = newCombatant(stats);
    c = addBlock(c, 8);
    c = clearBlock(c);
    expect(c.block).toBe(0);
  });

  it('clearBlock is identity when block is already 0', () => {
    const c = newCombatant(stats);
    expect(clearBlock(c)).toBe(c);
  });

  it('isAlive is false at 0 HP', () => {
    let c = newCombatant({ ...stats, maxHp: 10 });
    c = takePlayerDamage(c, { raw: 50, type: 'steel' }).combatant;
    expect(c.currentHp).toBe(0);
    expect(isAlive(c)).toBe(false);
  });

  it('resistance reduces damage taken', () => {
    let c = newCombatant({ ...stats, resistances: { pyre: 0.5 } });
    const r = takePlayerDamage(c, { raw: 20, type: 'pyre' });
    expect(r.result.hpDelta).toBe(10); // 20 * 0.5
  });

  it('Marked status amplifies incoming damage and is consumed', () => {
    let c = newCombatant(stats);
    c = applyPlayerStatus(c, 'marked', 1, 2);
    const r = takePlayerDamage(c, { raw: 10, type: 'steel' });
    expect(r.result.hpDelta).toBe(15); // 10 * 1.5
    expect(r.combatant.statuses.marked).toBeUndefined();
  });

  it('damage pipe routes attackerAtk through', () => {
    const c = newCombatant(stats);
    const r = takePlayerDamage(c, { raw: 5, type: 'steel', attackerAtk: 3 });
    expect(r.result.hpDelta).toBe(8);
  });
});

describe('tickEndOfPlayerTurn', () => {
  const stats = baseStatsForLevel(1);

  it('Burn ticks DoT damage and decays', () => {
    let c = newCombatant({ ...stats, maxHp: 100 });
    c.currentHp = 100;
    c = applyPlayerStatus(c, 'burn', 4, 3);
    const r = tickEndOfPlayerTurn(c);
    expect(r.dotDamage).toBe(12); // 3 * 4
    expect(r.combatant.currentHp).toBe(88);
    expect(r.combatant.statuses.burn?.stacks).toBe(3);
    expect(r.combatant.statuses.burn?.turnsRemaining).toBe(2); // decay turns by 1
  });

  it('Regen heals after DoT damage', () => {
    let c = newCombatant({ ...stats, maxHp: 100 });
    c.currentHp = 50;
    c = applyPlayerStatus(c, 'regen', 4, 3);
    const r = tickEndOfPlayerTurn(c);
    expect(r.regenHeal).toBe(12);
    expect(r.combatant.currentHp).toBe(62);
  });

  it('Burn + Regen tick same turn', () => {
    let c = newCombatant({ ...stats, maxHp: 100 });
    c.currentHp = 50;
    c = applyPlayerStatus(c, 'burn', 2, 3);
    c = applyPlayerStatus(c, 'regen', 1, 3);
    const r = tickEndOfPlayerTurn(c);
    // 50 - 6 burn + 3 regen = 47
    expect(r.dotDamage).toBe(6);
    expect(r.regenHeal).toBe(3);
    expect(r.combatant.currentHp).toBe(47);
  });

  it('cleanTurn flag is true with no DoT damage', () => {
    const c = newCombatant(stats);
    const r = tickEndOfPlayerTurn(c);
    expect(r.cleanTurn).toBe(true);
  });
});
