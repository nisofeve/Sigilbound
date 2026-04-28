import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  addEnemyBlock,
  applyEnemyDamage,
  isEnemyAlive,
  newEnemyState,
  setEnemyIntent,
  type EnemyDef,
} from './enemy';
import { advanceCharge, chooseIntent } from './enemyAI';

const goblinBrute: EnemyDef = {
  id: 'goblin_brute',
  name: 'Goblin Brute',
  archetype: 'brute',
  difficulty: 'easy',
  sprite: '👹',
  baseHp: 30,
  atk: 8,
  def: 0,
  speed: 0.8,
  damageType: 'steel',
};

const skirmisher: EnemyDef = {
  id: 'goblin_skirmisher',
  name: 'Goblin Skirmisher',
  archetype: 'skirmisher',
  difficulty: 'easy',
  sprite: '🗡️',
  baseHp: 14,
  atk: 4,
  def: 0,
  speed: 1.2,
  damageType: 'pierce',
};

const caster: EnemyDef = {
  id: 'frost_witch',
  name: 'Frost Witch',
  archetype: 'caster',
  difficulty: 'medium',
  sprite: '🧙',
  baseHp: 40,
  atk: 8,
  def: 0,
  speed: 1.0,
  damageType: 'frost',
};

const tank: EnemyDef = {
  id: 'iron_golem',
  name: 'Iron Golem',
  archetype: 'tank',
  difficulty: 'hard',
  sprite: '🗿',
  baseHp: 140,
  atk: 12,
  def: 4,
  speed: 0.7,
  damageType: 'steel',
  resistances: { steel: 0.5 },
};

const summoner: EnemyDef = {
  id: 'necromancer',
  name: 'Necromancer',
  archetype: 'summoner',
  difficulty: 'hard',
  sprite: '💀',
  baseHp: 80,
  atk: 6,
  def: 0,
  speed: 1.0,
  damageType: 'arcane',
};

describe('enemy state', () => {
  it('newEnemyState fills HP/atk from def', () => {
    const e = newEnemyState(goblinBrute, 'g1');
    expect(e.maxHp).toBe(30);
    expect(e.currentHp).toBe(30);
    expect(e.atk).toBe(8);
    expect(e.archetype).toBe('brute');
    expect(e.damageType).toBe('steel');
    expect(e.block).toBe(0);
    expect(e.turnsTaken).toBe(0);
  });

  it('isEnemyAlive returns true at full HP, false at 0', () => {
    const e = newEnemyState(goblinBrute, 'g1');
    expect(isEnemyAlive(e)).toBe(true);
    const dead = applyEnemyDamage(e, 30, 0);
    expect(isEnemyAlive(dead)).toBe(false);
    expect(dead.currentHp).toBe(0);
  });

  it('applyEnemyDamage clamps at 0', () => {
    const e = newEnemyState(goblinBrute, 'g1');
    const dead = applyEnemyDamage(e, 9999, 0);
    expect(dead.currentHp).toBe(0);
  });

  it('addEnemyBlock stacks; ignored at <=0', () => {
    let e = newEnemyState(tank, 't1');
    e = addEnemyBlock(e, 5);
    e = addEnemyBlock(e, 3);
    expect(e.block).toBe(8);
    e = addEnemyBlock(e, 0);
    expect(e.block).toBe(8);
    e = addEnemyBlock(e, -10);
    expect(e.block).toBe(8);
  });

  it('setEnemyIntent replaces the intent telegraph', () => {
    let e = newEnemyState(goblinBrute, 'g1');
    e = setEnemyIntent(e, { kind: 'block', amount: 12 });
    expect(e.intent).toEqual({ kind: 'block', amount: 12 });
  });

  it('inherits resistances from def', () => {
    const e = newEnemyState(tank, 't1');
    expect(e.resistances.steel).toBe(0.5);
  });
});

describe('chooseIntent — determinism', () => {
  it('same seed produces identical intent', () => {
    const e = newEnemyState(goblinBrute, 'g1');
    const i1 = chooseIntent(goblinBrute, e, createRng(42));
    const i2 = chooseIntent(goblinBrute, e, createRng(42));
    expect(i1).toEqual(i2);
  });

  it('different seeds can produce different intents over many trials', () => {
    const e = newEnemyState(goblinBrute, 'g1');
    const seen = new Set<string>();
    for (let seed = 1; seed < 50; seed++) {
      const i = chooseIntent(goblinBrute, e, createRng(seed));
      seen.add(i.kind);
    }
    // brute table has attack, charge, block — should hit at least 2 kinds
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});

describe('chooseIntent — archetype behaviours', () => {
  function sample(def: EnemyDef, count = 200): Map<string, number> {
    const e = newEnemyState(def, 'x');
    const counts = new Map<string, number>();
    for (let s = 0; s < count; s++) {
      const i = chooseIntent(def, e, createRng(s + 1));
      const key = i.kind === 'attack'
        ? `attack(${i.hits ?? 1})`
        : i.kind === 'charge'
        ? `charge(${i.payload.kind})`
        : i.kind === 'debuff'
        ? `debuff(${i.status})`
        : i.kind;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  it('brute: mostly attacks, sometimes charges, occasionally blocks', () => {
    const c = sample(goblinBrute);
    const attackPct = (c.get('attack(1)') ?? 0) / 200;
    expect(attackPct).toBeGreaterThan(0.5);  // 70% target with variance
    expect(c.get('charge(attack)')).toBeGreaterThan(0);
    expect(c.get('block')).toBeGreaterThan(0);
  });

  it('skirmisher: produces multi-hit attacks (hits=3) most often', () => {
    const c = sample(skirmisher);
    const multihit = c.get('attack(3)') ?? 0;
    expect(multihit).toBeGreaterThan(50); // ~60% target
  });

  it('caster: emits debuffs and ranged attacks', () => {
    const c = sample(caster);
    const debuffWeak = c.get('debuff(weakened)') ?? 0;
    const debuffMark = c.get('debuff(marked)') ?? 0;
    expect(debuffWeak + debuffMark).toBeGreaterThan(20);
    expect(c.get('attack(1)')).toBeGreaterThan(0);
  });

  it('tank: blocks majority of turns, sometimes attacks with piercing', () => {
    const c = sample(tank);
    const blocks = c.get('block') ?? 0;
    expect(blocks).toBeGreaterThan(60); // ~50% target
    expect(c.get('attack(1)')).toBeGreaterThan(0);
  });

  it('summoner: forces summon every 2nd turn', () => {
    let e = newEnemyState(summoner, 's1');
    e = { ...e, turnsTaken: 2 };
    const intent = chooseIntent(summoner, e, createRng(1));
    expect(intent.kind).toBe('summon');
    if (intent.kind === 'summon') {
      expect(intent.archetype).toBe('skirmisher');
    }
  });

  it('summoner: rolls normally on odd turns', () => {
    let e = newEnemyState(summoner, 's1');
    e = { ...e, turnsTaken: 1 };
    const c = new Map<string, number>();
    for (let s = 0; s < 100; s++) {
      const i = chooseIntent(summoner, e, createRng(s + 1));
      c.set(i.kind, (c.get(i.kind) ?? 0) + 1);
    }
    // Most rolls should NOT be summon on odd turns.
    expect(c.get('summon') ?? 0).toBeLessThan(20);
  });
});

describe('advanceCharge', () => {
  it('decrements turnsLeft when > 0', () => {
    const charge = { kind: 'charge' as const, turnsLeft: 2, payload: { kind: 'attack' as const, damage: 30, type: 'pyre' as const } };
    const next = advanceCharge(charge);
    expect(next.kind).toBe('charge');
    if (next.kind === 'charge') {
      expect(next.turnsLeft).toBe(1);
    }
  });

  it('resolves to payload when turnsLeft is 0', () => {
    const charge = { kind: 'charge' as const, turnsLeft: 0, payload: { kind: 'attack' as const, damage: 30, type: 'pyre' as const } };
    const next = advanceCharge(charge);
    expect(next.kind).toBe('attack');
    if (next.kind === 'attack') {
      expect(next.damage).toBe(30);
    }
  });

  it('non-charge intents pass through unchanged', () => {
    const block = { kind: 'block' as const, amount: 5 };
    expect(advanceCharge(block)).toEqual(block);
  });
});

describe('chooseIntent — custom boss behaviour', () => {
  it('uses customBehavior table when provided, ignoring archetype defaults', () => {
    const customBoss: EnemyDef = {
      ...goblinBrute,
      id: 'lord_of_ashes',
      archetype: 'boss',
      customBehavior: [
        // Always returns this fixed intent (weight is the only entry)
        { weight: 1, build: () => ({ kind: 'debuff', status: 'curse', stacks: 3, turns: 99 }) },
      ],
    };
    const e = newEnemyState(customBoss, 'b1');
    for (let seed = 1; seed < 20; seed++) {
      const i = chooseIntent(customBoss, e, createRng(seed));
      expect(i.kind).toBe('debuff');
      if (i.kind === 'debuff') {
        expect(i.status).toBe('curse');
        expect(i.stacks).toBe(3);
      }
    }
  });

  it('falls back to attack when custom table is empty', () => {
    const broken: EnemyDef = { ...goblinBrute, customBehavior: [] };
    const e = newEnemyState(broken, 'x');
    const i = chooseIntent(broken, e, createRng(1));
    expect(i.kind).toBe('attack');
  });
});
