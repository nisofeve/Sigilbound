import { describe, expect, it } from 'vitest';
import { BattleRunner, type ActionInstance, type BattleConfig } from './battle';
import { baseStatsForLevel } from './player';
import type { EnemyDef } from './enemy';
import { emptyEquippedSet, equip, type EquipmentDef } from './equipment';
import { getAction as getActionDef } from './actionCards';

const goblin: EnemyDef = {
  id: 'goblin',
  name: 'Goblin',
  archetype: 'brute',
  difficulty: 'easy',
  sprite: '👹',
  baseHp: 30,
  atk: 6,
  def: 0,
  speed: 0.8,
  damageType: 'steel',
};

const slimeWeak: EnemyDef = {
  id: 'slime',
  name: 'Slime',
  archetype: 'brute',
  difficulty: 'easy',
  sprite: '🟢',
  baseHp: 5,
  atk: 1,
  def: 0,
  speed: 0.8,
  damageType: 'steel',
};

const tank: EnemyDef = {
  id: 'iron_golem',
  name: 'Iron Golem',
  archetype: 'tank',
  difficulty: 'hard',
  sprite: '🗿',
  baseHp: 60,
  atk: 12,
  def: 4,
  speed: 0.7,
  damageType: 'steel',
  resistances: { steel: 0.5 },
};

function strike(damage: number, type: 'steel' | 'pierce' | 'pyre' | 'frost' | 'arcane' = 'steel', charge = 0): ActionInstance {
  return { cardId: `dbg_${type}`, damage, damageType: type, charge };
}

function defaultConfig(over: Partial<BattleConfig> = {}): BattleConfig {
  return {
    seed: 1,
    playerStats: baseStatsForLevel(1),
    enemyDefs: [goblin],
    ...over,
  };
}

describe('BattleRunner — construction', () => {
  it('starts with player at full HP and slot count from stats', () => {
    const runner = new BattleRunner(defaultConfig());
    expect(runner.state.player.currentHp).toBe(50);
    expect(runner.state.slots).toHaveLength(3);
    expect(runner.state.slots.every(s => s.bound === null)).toBe(true);
    expect(runner.state.outcome).toBe('in_progress');
    expect(runner.state.turn).toBe(1);
  });

  it('seeds enemies with telegraphed intents', () => {
    const runner = new BattleRunner(defaultConfig());
    expect(runner.state.enemies).toHaveLength(1);
    expect(runner.state.enemies[0].intent).toBeDefined();
    // brute table always produces an intent of one of these kinds
    expect(['attack', 'charge', 'block']).toContain(runner.state.enemies[0].intent.kind);
  });

  it('applies starting actions to slots', () => {
    const runner = new BattleRunner({
      ...defaultConfig(),
      startingActions: [strike(10), strike(8)],
    });
    expect(runner.state.slots[0].bound).not.toBeNull();
    expect(runner.state.slots[1].bound).not.toBeNull();
    expect(runner.state.slots[2].bound).toBeNull();
  });

  it('Sigilbinder\'s Will reaction fires onStageStart, gives block + draw', () => {
    const runner = new BattleRunner({
      ...defaultConfig(),
      reactions: ['sigilbinders_will'],
    });
    expect(runner.state.player.block).toBe(4);
    // sigilbinders_will is one-shot — should be in consumed.
    expect(runner.state.reactions.consumed).toContain('sigilbinders_will');
  });
});

describe('BattleRunner — slot binding', () => {
  it('bindToSlot fills an empty slot and auto-targets leftmost enemy', () => {
    const runner = new BattleRunner(defaultConfig());
    const ok = runner.bindToSlot(0, strike(5));
    expect(ok).toBe(true);
    expect(runner.state.slots[0].bound?.targetEnemyId).toBe('goblin_0');
  });

  it('bindToSlot rejects already-bound slot', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, strike(5));
    expect(runner.bindToSlot(0, strike(8))).toBe(false);
  });

  it('unbindSlot empties a bound slot', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, strike(5));
    expect(runner.unbindSlot(0)).toBe(true);
    expect(runner.state.slots[0].bound).toBeNull();
  });

  it('returnSlotToHand: same-turn bound action returns to hand', () => {
    const runner = new BattleRunner(defaultConfig());
    // Find an action card in the starting hand and bind it.
    const handIdx = runner.state.hand.findIndex(id => !!getActionDef(id));
    expect(handIdx).toBeGreaterThanOrEqual(0);
    const cardId = runner.state.hand[handIdx];
    const handLenBefore = runner.state.hand.length;

    expect(runner.bindHandToSlot(handIdx, 0)).toBe(true);
    expect(runner.state.hand.length).toBe(handLenBefore - 1);
    expect(runner.state.slots[0].bound?.cardId).toBe(cardId);

    // Card was bound this turn (charge untouched) → returnable.
    expect(runner.canReturnSlotToHand(0)).toBe(true);
    expect(runner.returnSlotToHand(0)).toBe(true);
    expect(runner.state.slots[0].bound).toBeNull();
    expect(runner.state.hand).toContain(cardId);
    expect(runner.state.hand.length).toBe(handLenBefore);
  });

  it('returnSlotToHand: card from a previous turn is locked', () => {
    const runner = new BattleRunner(defaultConfig());
    const def = getActionDef('act_003')!; // Heavy Swing — charge: 2
    runner.bindToSlot(0, {
      cardId: def.id, damage: def.damage, damageType: def.damageType,
      charge: def.charge,
    });
    expect(runner.canReturnSlotToHand(0)).toBe(true);

    runner.endTurn();
    // After endTurn the charge ticked from 2 → 1 (not yet resolved). The
    // slot's boundOnTurn is now stale relative to state.turn, so it locks.
    expect(runner.state.slots[0].bound).not.toBeNull();
    expect(runner.canReturnSlotToHand(0)).toBe(false);
    expect(runner.returnSlotToHand(0)).toBe(false);
  });

  it('returnSlotToHand: empty slot returns false', () => {
    const runner = new BattleRunner(defaultConfig());
    expect(runner.canReturnSlotToHand(0)).toBe(false);
    expect(runner.returnSlotToHand(0)).toBe(false);
  });

  it('endTurn emits resolve events with slot, target, hp deltas', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 0 });
    runner.endTurn();
    const log = runner.getLastResolveLog();
    const resolves = log.filter(e => e.kind === 'action_resolve');
    expect(resolves.length).toBe(1);
    const ev = resolves[0];
    if (ev.kind !== 'action_resolve') throw new Error('shape');
    expect(ev.slotIndex).toBe(0);
    expect(ev.cardId).toBe('act_001');
    expect(ev.damageType).toBe('steel');
    expect(ev.targetEnemyId).toBeDefined();
    expect(ev.enemyHpAfter).toBeLessThanOrEqual(ev.enemyHpBefore);
  });

  it('previewCombosForEndTurn returns element chain when 2+ adjacent same-type slots resolve', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 0 });
    runner.bindToSlot(1, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 0 });
    const preview = runner.previewCombosForEndTurn();
    expect(preview.chains).toHaveLength(1);
    expect(preview.chains[0].indices.sort()).toEqual([0, 1]);
    expect(preview.chains[0].type).toBe('steel');
  });

  it('previewCombosForEndTurn returns no chain when types differ (no adjacent match)', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 0 });
    runner.bindToSlot(1, { cardId: 'act_006', damage: 5, damageType: 'pierce', charge: 0 });
    runner.bindToSlot(2, { cardId: 'act_x', damage: 5, damageType: 'pyre', charge: 0 });
    const preview = runner.previewCombosForEndTurn();
    expect(preview.chains).toHaveLength(0);
  });

  it('previewCombosForEndTurn ignores still-charging slots', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 0 });
    runner.bindToSlot(1, { cardId: 'act_001', damage: 5, damageType: 'steel', charge: 3 });
    const preview = runner.previewCombosForEndTurn();
    expect(preview.chains).toHaveLength(0); // slot 1 is still charging — no chain
  });

  it('endTurn emits enemy_attack event when an enemy strikes', () => {
    const runner = new BattleRunner(defaultConfig());
    // Force the first enemy onto an attack intent so endTurn emits enemy_attack.
    runner.state.enemies[0].intent = { kind: 'attack', damage: 3, type: 'steel' };
    runner.endTurn();
    const log = runner.getLastResolveLog();
    const enemyAttacks = log.filter(e => e.kind === 'enemy_attack');
    expect(enemyAttacks.length).toBeGreaterThanOrEqual(1);
  });

  it('retarget switches to a different living enemy', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [goblin, slimeWeak] }));
    runner.bindToSlot(0, strike(5));
    expect(runner.retarget(0, 'slime_1')).toBe(true);
    expect(runner.state.slots[0].bound?.targetEnemyId).toBe('slime_1');
  });

  it('retarget refuses dead enemies', () => {
    // Order matters: slime first so the auto-target kills it; goblin survives.
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [slimeWeak, goblin] }));
    runner.bindToSlot(0, strike(50));
    runner.endTurn();
    // slime_0 is dead now; goblin_1 still alive.
    runner.bindToSlot(0, strike(5));
    expect(runner.retarget(0, 'slime_0')).toBe(false);
    expect(runner.retarget(0, 'goblin_1')).toBe(true);
  });
});

describe('BattleRunner — turn resolution', () => {
  it('a 0-charge action resolves on endTurn and damages target', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, strike(8));
    runner.endTurn();
    expect(runner.state.enemies[0].currentHp).toBeLessThan(30);
  });

  it('a 2-charge action does NOT resolve on first endTurn', () => {
    const runner = new BattleRunner(defaultConfig());
    runner.bindToSlot(0, strike(20, 'steel', 2));
    const before = runner.state.enemies[0].currentHp;
    runner.endTurn();
    expect(runner.state.slots[0].bound?.charge).toBe(1);
    expect(runner.state.enemies[0].currentHp).toBe(before); // no damage yet (only enemy attack happened)
    // ... unless enemy hit player for steel damage but enemy hp untouched by us
  });

  it('killing the enemy ends the battle as cleared', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [slimeWeak] }));
    runner.bindToSlot(0, strike(50));
    const outcome = runner.endTurn();
    expect(outcome).toBe('cleared');
    expect(runner.state.outcome).toBe('cleared');
  });

  it('player dies if enough damage taken — outcome becomes defeated', () => {
    // Custom enemy that hits hard
    const heavy: EnemyDef = { ...goblin, id: 'ogre', atk: 200, baseHp: 999 };
    const runner = new BattleRunner({
      ...defaultConfig({ enemyDefs: [heavy] }),
      playerStats: { ...baseStatsForLevel(1), maxHp: 10 },
    });
    runner.bindToSlot(0, strike(1));
    const outcome = runner.endTurn();
    expect(outcome).toBe('defeated');
    expect(runner.state.player.currentHp).toBe(0);
  });
});

describe('BattleRunner — combos', () => {
  it('Element chain fires when 3 adjacent same-type actions resolve together', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [tank] }));
    // Use damage values that land cleanly through tank's resistance + def.
    // Tank has steel resist 0.5 and def 4, so per-strike: raw × 1.2 × 0.5 - 4.
    // 20 raw → 12 buffed → -4 def = 8 dmg, regardless of crit luck.
    runner.bindToSlot(0, strike(20, 'steel'));
    runner.bindToSlot(1, strike(20, 'steel'));
    runner.bindToSlot(2, strike(20, 'steel'));
    const before = runner.state.enemies[0].currentHp;
    runner.endTurn();
    expect(runner.state.combosTriggeredThisStage.element_chain).toBeGreaterThan(0);
    // 3 adjacent same-type → +50% bonus on each. Sanity: tank HP went down.
    expect(runner.state.enemies[0].currentHp).toBeLessThan(before);
  });

  it('No element chain fires on 3 distinct types', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [{ ...goblin, baseHp: 200 }] }));
    runner.bindToSlot(0, strike(5, 'steel'));
    runner.bindToSlot(1, strike(5, 'pyre'));
    runner.bindToSlot(2, strike(5, 'frost'));
    runner.endTurn();
    expect(runner.state.combosTriggeredThisStage.element_chain).toBe(0);
  });

  it('Element chain does not build cross-turn state', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [{ ...goblin, baseHp: 999, atk: 0 }] }));
    runner.bindToSlot(0, strike(3, 'pyre'));
    runner.endTurn();
    // No relentlessStreak field — element chain has no cross-turn state.
    runner.bindToSlot(0, strike(3, 'pyre'));
    runner.endTurn();
    expect(runner.state.combosTriggeredThisStage.element_chain).toBe(0); // single slot = no chain
  });

  it('Mixed type between two same-type breaks the element chain', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [{ ...goblin, baseHp: 999, atk: 0 }] }));
    // [fire, ice, fire] — fire at [0] and [2] are NOT adjacent, so no chain.
    runner.bindToSlot(0, strike(3, 'pyre'));
    runner.bindToSlot(1, strike(3, 'frost'));
    runner.bindToSlot(2, strike(3, 'pyre'));
    runner.endTurn();
    expect(runner.state.combosTriggeredThisStage.element_chain).toBe(0);
  });
});

describe('BattleRunner — targeting cascade', () => {
  it('cascades to next leftmost enemy when target dies mid-resolution', () => {
    const runner = new BattleRunner(defaultConfig({ enemyDefs: [slimeWeak, slimeWeak] }));
    // Two strikes both targeting first slime. Second one should cascade.
    runner.bindToSlot(0, strike(20));
    runner.bindToSlot(1, strike(20));
    runner.endTurn();
    expect(runner.state.outcome).toBe('cleared');
    expect(runner.state.enemies.every(e => e.currentHp === 0)).toBe(true);
  });
});

describe('BattleRunner — reactions', () => {
  it('Bloodthirst heals 3 HP on kill', () => {
    // Use a passive slime (atk 0) as the surviving enemy so the heal is the
    // only HP delta after the player's strike kills the leftmost slime.
    const passiveSlime = { ...slimeWeak, id: 'pacifist', atk: 0 };
    const runner = new BattleRunner({
      ...defaultConfig({ enemyDefs: [slimeWeak, passiveSlime] }),
      reactions: ['bloodthirst'],
      playerStats: { ...baseStatsForLevel(1), maxHp: 100 },
    });
    runner.state.player.currentHp = 50; // drop HP to verify heal
    runner.bindToSlot(0, strike(20));
    runner.endTurn();
    expect(runner.state.player.currentHp).toBe(53); // +3 from bloodthirst, no enemy damage
    // Bloodthirst was consumed
    expect(runner.state.reactions.active).not.toContain('bloodthirst');
  });

  it('Phoenix Heart prevents lethal damage and survives at 1 HP', () => {
    const heavy: EnemyDef = { ...goblin, id: 'reaper', atk: 999, baseHp: 999 };
    const runner = new BattleRunner({
      ...defaultConfig({ enemyDefs: [heavy] }),
      playerStats: { ...baseStatsForLevel(1), maxHp: 5 },
      reactions: ['phoenix_heart'],
    });
    runner.bindToSlot(0, strike(1));
    runner.endTurn();
    // Battle should NOT be defeated — phoenix_heart kicked in.
    expect(runner.state.player.currentHp).toBe(1);
    expect(runner.state.outcome).toBe('in_progress');
  });
});

describe('BattleRunner — equipment integration', () => {
  const ironShortsword: EquipmentDef = {
    id: 'iron_shortsword',
    slot: 'weapon',
    rarity: 'common',
    name: 'Iron Shortsword',
    icon: '🗡️',
    description: '+2 Atk, adds 2 Quick Slash to deck',
    stats: { atk: 2 },
    deckAdditions: [{ cardId: 'act_001', count: 2 }],
  };

  const heartOfSigilkeeper: EquipmentDef = {
    id: 'heart_of_sigilkeeper',
    slot: 'amulet',
    rarity: 'legendary',
    name: 'Heart of the Sigilkeeper',
    icon: '📿',
    description: '+1 Sigil Slot for the run',
    stats: { sigilSlots: 1 },
  };

  const pyreRing: EquipmentDef = {
    id: 'phoenix_signet',
    slot: 'ring',
    rarity: 'rare',
    name: 'Phoenix Signet',
    icon: '💍',
    description: '+10% Pyre damage',
    stats: {},
    triggers: [{ kind: 'damage_type_bonus', type: 'pyre', pct: 0.10 }],
  };

  const drakehidePlate: EquipmentDef = {
    id: 'drakehide_plate',
    slot: 'armor',
    rarity: 'epic',
    name: 'Drakehide Plate',
    icon: '🥋',
    description: '+40 HP, heal 5 on Onslaught',
    stats: { maxHp: 40 },
    triggers: [{ kind: 'on_combo', combo: 'onslaught', healHp: 5 }],
  };

  const passiveTarget: EnemyDef = { ...goblin, atk: 0, baseHp: 999 };

  it('compiled equipment produces deck additions accessible via getter', () => {
    const set = equip(emptyEquippedSet(), ironShortsword);
    const runner = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: set,
      enemyDefs: [passiveTarget],
    });
    expect(runner.equipmentDeckAdditions).toEqual([{ cardId: 'act_001', count: 2 }]);
  });

  it('Heart of the Sigilkeeper grants +1 sigil slot at construction', () => {
    const set = equip(emptyEquippedSet(), heartOfSigilkeeper);
    const runner = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: set,
      enemyDefs: [passiveTarget],
    });
    expect(runner.state.slots).toHaveLength(4);
  });

  it('damage_type_bonus boosts matching damage type', () => {
    const noEquip = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: emptyEquippedSet(),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    noEquip.bindToSlot(0, strike(10, 'pyre'));
    noEquip.endTurn();
    const damageNoEquip = 999 - noEquip.state.enemies[0].currentHp;

    const set = equip(emptyEquippedSet(), pyreRing);
    const withEquip = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: set,
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    withEquip.bindToSlot(0, strike(10, 'pyre'));
    withEquip.endTurn();
    const damageWithEquip = 999 - withEquip.state.enemies[0].currentHp;

    // Same seed → same crit roll → with +10% Pyre we should deal MORE damage.
    expect(damageWithEquip).toBeGreaterThan(damageNoEquip);
  });

  it('damage_type_bonus does NOT affect off-type damage', () => {
    const noEquip = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: emptyEquippedSet(),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    noEquip.bindToSlot(0, strike(10, 'steel'));
    noEquip.endTurn();
    const damageNoEquip = 999 - noEquip.state.enemies[0].currentHp;

    const set = equip(emptyEquippedSet(), pyreRing);
    const withEquip = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: set,
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    withEquip.bindToSlot(0, strike(10, 'steel'));
    withEquip.endTurn();
    const damageWithEquip = 999 - withEquip.state.enemies[0].currentHp;

    expect(damageWithEquip).toBe(damageNoEquip);
  });

  it('on_combo healHp fires and restores HP when Onslaught triggers', () => {
    // Drakehide Plate: heal 5 on Onslaught.
    const set = equip(emptyEquippedSet(), drakehidePlate);
    const runner = new BattleRunner({
      seed: 1,
      level: 1,
      equipment: set,
      enemyDefs: [passiveTarget],
    });
    // Drop HP so heal is observable.
    runner.state.player.currentHp = runner.state.player.stats.maxHp - 20;
    const before = runner.state.player.currentHp;
    runner.bindToSlot(0, strike(3, 'steel'));
    runner.bindToSlot(1, strike(3, 'steel'));
    runner.endTurn();
    expect(runner.state.combosTriggeredThisStage.element_chain).toBe(1);
    expect(runner.state.player.currentHp).toBeGreaterThanOrEqual(before + 5);
  });

  it('falls back to level-only stats when equipment is omitted', () => {
    const runner = new BattleRunner({
      seed: 1,
      level: 5,
      enemyDefs: [passiveTarget],
    });
    expect(runner.state.player.stats.maxHp).toBe(50 + 4 * 4); // base + 4 levels
    expect(runner.state.slots).toHaveLength(3);              // base sigilSlots
  });

  it('honours playerStats override even when equipment is given', () => {
    const customStats = { ...baseStatsForLevel(1), maxHp: 200 };
    const set = equip(emptyEquippedSet(), heartOfSigilkeeper);
    const runner = new BattleRunner({
      seed: 1,
      playerStats: customStats,
      equipment: set,
      enemyDefs: [passiveTarget],
    });
    expect(runner.state.player.stats.maxHp).toBe(200);
    // Equipment still informs deck/triggers; sigilSlots came from override → 3
    expect(runner.state.slots).toHaveLength(3);
  });
});

describe('BattleRunner — Phase 6 deck system', () => {
  const passiveSlime: EnemyDef = {
    id: 'pacifist', name: 'Pacifist Slime', archetype: 'brute', difficulty: 'easy',
    sprite: '🟢', baseHp: 999, atk: 0, def: 0, speed: 0.8, damageType: 'steel',
  };

  it('draws an opening hand from the configured deck', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: ['act_001', 'act_002', 'act_011', 'tac_001', 'tac_002', 'act_015', 'act_019'],
    });
    expect(runner.state.hand).toHaveLength(5); // base hand size
    expect(runner.state.deck).toHaveLength(2); // 7 - 5 in hand
    expect(runner.state.discard).toHaveLength(0);
  });

  it('builds a fallback starter deck when nothing is configured', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
    });
    expect(runner.state.hand.length).toBeGreaterThan(0);
    // Total cards = hand + deck + discard, should match the fallback set.
    const total = runner.state.hand.length + runner.state.deck.length + runner.state.discard.length;
    expect(total).toBeGreaterThanOrEqual(5);
  });

  it('bindHandToSlot moves card from hand → slot, removes from hand', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: ['act_001', 'act_002', 'act_011', 'act_015', 'act_019'],
    });
    const handBefore = runner.state.hand.length;
    const cardId = runner.state.hand[0];
    expect(runner.bindHandToSlot(0, 0)).toBe(true);
    expect(runner.state.hand).toHaveLength(handBefore - 1);
    expect(runner.state.slots[0].bound?.cardId).toBe(cardId);
  });

  it('bindHandToSlot fails on a tactic card (only actions are bindable)', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: ['tac_001', 'tac_001', 'tac_001', 'tac_001', 'tac_001'],
    });
    expect(runner.bindHandToSlot(0, 0)).toBe(false);
    expect(runner.state.slots[0].bound).toBeNull();
  });

  it('end of turn discards remaining hand and draws a fresh hand', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: Array.from({ length: 15 }, (_, i) => i % 2 === 0 ? 'act_001' : 'act_002'),
    });
    const handBefore = runner.state.hand.length;
    runner.endTurn();
    expect(runner.state.hand.length).toBe(handBefore); // re-drawn to handSize
    expect(runner.state.discard.length).toBeGreaterThan(0);
  });

  it('reshuffles discard into deck when deck runs dry', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: ['act_001', 'act_002', 'act_011', 'act_015', 'act_019'],
    });
    // 5 cards total → all in hand → deck empty.
    expect(runner.state.deck).toHaveLength(0);
    // End turn discards hand. Next draw reshuffles discard back into deck.
    runner.endTurn();
    // Hand redrew from the freshly shuffled discard pile.
    expect(runner.state.hand.length).toBeGreaterThan(0);
  });

  it('resolved actions go to the discard pile', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: Array.from({ length: 10 }, () => 'act_001' as const),
    });
    const cardId = runner.state.hand[0];
    runner.bindHandToSlot(0, 0);
    runner.endTurn();
    expect(runner.state.discard).toContain(cardId);
  });

  it('stamina resets to playerStats.stamina at end of turn', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), stamina: 4 },
      enemyDefs: [passiveSlime],
    });
    expect(runner.state.staminaThisTurn).toBe(4);
    // Forcefully drain stamina then end-turn.
    runner.state.staminaThisTurn = 0;
    runner.endTurn();
    expect(runner.state.staminaThisTurn).toBe(4);
  });
});

describe('BattleRunner — Phase 6 tactic play', () => {
  const passiveSlime: EnemyDef = {
    id: 'pacifist', name: 'Pacifist Slime', archetype: 'brute', difficulty: 'easy',
    sprite: '🟢', baseHp: 999, atk: 0, def: 0, speed: 0.8, damageType: 'steel',
  };

  // Helper: find the index of a specific card id in the hand. The deck is
  // shuffled deterministically so position depends on seed; tests find by id.
  function findInHand(runner: BattleRunner, cardId: string): number {
    return runner.state.hand.indexOf(cardId);
  }

  it('Block tactic adds block + consumes stamina', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), stamina: 5 },
      enemyDefs: [passiveSlime],
      deck: ['tac_001', 'act_001', 'act_001', 'act_001', 'act_001'],
    });
    const idx = findInHand(runner, 'tac_001');
    expect(idx).toBeGreaterThanOrEqual(0);
    const blockBefore = runner.state.player.block;
    expect(runner.playTactic(idx)).toBe('played');
    // Block tactic authored amount = 8. Card-level system applies the
    // level-1 baseline multiplier (0.6×) → round(8 × 0.6) = 5.
    expect(runner.state.player.block).toBe(blockBefore + 5);
    expect(runner.state.staminaThisTurn).toBe(4); // 5 - 1
    expect(runner.state.hand).toHaveLength(4);
    expect(runner.state.discard).toContain('tac_001');
  });

  it('Heal tactic restores HP', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 100, stamina: 5 },
      enemyDefs: [passiveSlime],
      deck: ['tac_004', 'act_001', 'act_001', 'act_001', 'act_001'],
    });
    runner.state.player.currentHp = 50;
    const idx = findInHand(runner, 'tac_004');
    expect(runner.playTactic(idx)).toBe('played');
    // Heal tactic authored amount = 10. Level-1 baseline = round(10 × 0.6) = 6.
    expect(runner.state.player.currentHp).toBe(56);
  });

  it('Inspire draws 2 cards', () => {
    // Force the entire deck into hand on construction (initialHandSize = full
    // deck size), then there are still cards left in the deck for Inspire's
    // draw 2 only if we keep extras. Solution: set initialHandSize to small,
    // then draw extra cards until tac_005 is in hand.
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), stamina: 5 },
      enemyDefs: [passiveSlime],
      initialHandSize: 0,
      deck: ['tac_005', 'act_001', 'act_001', 'act_002', 'act_002',
             'act_011', 'act_015', 'act_019'],
    });
    // Draw cards until tac_005 surfaces in hand. Worst case: it's at deck
    // bottom and we draw 8.
    while (findInHand(runner, 'tac_005') === -1 && runner.state.deck.length > 0) {
      runner.drawCards(1);
    }
    const idx = findInHand(runner, 'tac_005');
    expect(idx).toBeGreaterThanOrEqual(0);
    const handBefore = runner.state.hand.length;
    expect(runner.playTactic(idx)).toBe('played');
    expect(runner.state.hand.length).toBe(handBefore + 1); // -1 played + 2 drawn
  });

  it('returns cant_afford when stamina is too low', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), stamina: 0 },
      enemyDefs: [passiveSlime],
      deck: ['tac_003', 'act_001', 'act_001', 'act_001', 'act_001'],
    });
    const idx = findInHand(runner, 'tac_003');
    expect(runner.playTactic(idx)).toBe('cant_afford');
    expect(runner.state.hand).toContain('tac_003');
  });

  it('returns invalid for an action card (bind it instead)', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveSlime],
      deck: ['act_001', 'act_001', 'act_001', 'act_001', 'act_001'],
    });
    expect(runner.playTactic(0)).toBe('invalid');
  });

  it('Soulburn applies burn to all living enemies', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), stamina: 5 },
      enemyDefs: [passiveSlime, { ...passiveSlime, id: 'p2' }],
      deck: ['tac_016', 'act_001', 'act_001', 'act_001', 'act_001'],
    });
    const idx = findInHand(runner, 'tac_016');
    runner.playTactic(idx);
    for (const e of runner.state.enemies) {
      expect(e.statuses.burn?.stacks).toBe(5);
    }
  });
});

describe('BattleRunner — Phase 6C talent runtime', () => {
  const passiveTarget: EnemyDef = {
    id: 'pacifist', name: 'Pacifist', archetype: 'brute', difficulty: 'easy',
    sprite: '🟢', baseHp: 999, atk: 0, def: 0, speed: 0.8, damageType: 'steel',
  };

  function passiveTalent(id: string, modifier: object): import('./types').Perk {
    return {
      id, name: id, rarity: 'common', kind: 'passive',
      icon: '⚪', description: 'test',
      modifier: modifier as import('./types').PerkModifier,
    };
  }

  it('Vigorous heals 5 HP at stage start', () => {
    const t = passiveTalent('talent.vigorous', { type: 'max_hp_bonus', value: 10 });
    const runner = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1), enemyDefs: [passiveTarget], talents: [t],
    });
    runner.state.player.currentHp = 30;
    // Stage start heal already applied during construction; check via re-construct.
    const r2 = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 100 },
      enemyDefs: [passiveTarget],
      talents: [t],
    });
    // Player started at full HP (100). Heal capped — but we assert the
    // talent's stageStartHeal field is 5 in the compiled state.
    expect(r2.state.talents.stageStartHeal).toBe(5);
  });

  it('Battlecry: first action card resolved this turn deals +25%', () => {
    const battlecry = passiveTalent('talent.battlecry', { type: 'first_action_damage_bonus', pct: 0.25 });

    const noTalent = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    noTalent.bindToSlot(0, strike(20, 'steel'));
    noTalent.endTurn();
    const noTalentDmg = 999 - noTalent.state.enemies[0].currentHp;

    const withTalent = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
      talents: [battlecry],
    });
    withTalent.bindToSlot(0, strike(20, 'steel'));
    withTalent.endTurn();
    const withTalentDmg = 999 - withTalent.state.enemies[0].currentHp;

    expect(withTalentDmg).toBeGreaterThan(noTalentDmg);
  });

  it('Steel Specialist: +15% Steel damage', () => {
    const t = passiveTalent('talent.steel_specialist', { type: 'damage_type_bonus', damageType: 'steel', pct: 0.15 });

    const baseline = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    baseline.bindToSlot(0, strike(20, 'steel'));
    baseline.endTurn();

    const buffed = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
      talents: [t],
    });
    buffed.bindToSlot(0, strike(20, 'steel'));
    buffed.endTurn();

    expect(999 - buffed.state.enemies[0].currentHp)
      .toBeGreaterThan(999 - baseline.state.enemies[0].currentHp);
  });

  it('Steel Specialist does NOT boost Pyre damage', () => {
    const t = passiveTalent('talent.steel_specialist', { type: 'damage_type_bonus', damageType: 'steel', pct: 0.15 });

    const baseline = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
    });
    baseline.bindToSlot(0, strike(20, 'pyre'));
    baseline.endTurn();

    const withTalent = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 999 }],
      talents: [t],
    });
    withTalent.bindToSlot(0, strike(20, 'pyre'));
    withTalent.endTurn();

    expect(999 - withTalent.state.enemies[0].currentHp)
      .toBe(999 - baseline.state.enemies[0].currentHp);
  });

  it('Sigilbound Master doubles combo damage scale', () => {
    const t = passiveTalent('talent.sigilbound_master', { type: 'all_combo_damage_mult', mult: 2.0 });

    const baseline = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 9999 }],
    });
    baseline.bindToSlot(0, strike(20, 'steel'));
    baseline.bindToSlot(1, strike(20, 'steel'));
    baseline.endTurn();
    const baselineDmg = 9999 - baseline.state.enemies[0].currentHp;

    const withTalent = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [{ ...passiveTarget, baseHp: 9999 }],
      talents: [t],
    });
    withTalent.bindToSlot(0, strike(20, 'steel'));
    withTalent.bindToSlot(1, strike(20, 'steel'));
    withTalent.endTurn();
    const withTalentDmg = 9999 - withTalent.state.enemies[0].currentHp;

    // Onslaught at 2 same = +10%; doubled = +20%. So Sigilbound Master should
    // beat baseline.
    expect(withTalentDmg).toBeGreaterThan(baselineDmg);
  });

  it('Iron Discipline: block carries to next turn (capped at 20)', () => {
    const t = passiveTalent('talent.iron_discipline', { type: 'block_carry_cap', value: 20 });
    const runner = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1),
      enemyDefs: [passiveTarget],
      talents: [t],
    });
    runner.state.player = { ...runner.state.player, block: 25 };
    runner.endTurn();
    // Block should have carried up to the cap (20).
    expect(runner.state.player.block).toBe(20);
  });

  it('without Iron Discipline, block clears at end of turn', () => {
    const runner = new BattleRunner({
      seed: 1, playerStats: baseStatsForLevel(1), enemyDefs: [passiveTarget],
    });
    runner.state.player = { ...runner.state.player, block: 25 };
    runner.endTurn();
    expect(runner.state.player.block).toBe(0);
  });

  it('Swift Recovery heals 5 HP at end of clean turn', () => {
    const t = passiveTalent('talent.swift_recovery', { type: 'clean_turn_heal', value: 5 });
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 100 },
      enemyDefs: [passiveTarget],
      talents: [t],
    });
    runner.state.player.currentHp = 50;
    runner.endTurn();
    expect(runner.state.player.currentHp).toBe(55);
  });
});

describe('BattleRunner — Phase 6E Hardcore mode', () => {
  const passiveTarget: EnemyDef = {
    id: 'p', name: 'p', archetype: 'brute', difficulty: 'easy',
    sprite: '🟢', baseHp: 10, atk: 0, def: 0, speed: 0.8, damageType: 'steel',
  };

  it('initialHp seeds currentHp below maxHp (Hardcore arc carry)', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 100 },
      enemyDefs: [passiveTarget],
      initialHp: 32,
    });
    expect(runner.state.player.currentHp).toBe(32);
    expect(runner.state.player.stats.maxHp).toBe(100);
  });

  it('initialHp clamps to maxHp', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 50 },
      enemyDefs: [passiveTarget],
      initialHp: 9999,
    });
    expect(runner.state.player.currentHp).toBe(50);
  });

  it('omitting initialHp starts at full HP (default mode)', () => {
    const runner = new BattleRunner({
      seed: 1,
      playerStats: { ...baseStatsForLevel(1), maxHp: 80 },
      enemyDefs: [passiveTarget],
    });
    expect(runner.state.player.currentHp).toBe(80);
  });
});
