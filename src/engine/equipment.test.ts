import { describe, expect, it } from 'vitest';
import {
  canCraft,
  canSalvage,
  canUpgrade,
  compileEquipment,
  craft,
  craftCost,
  emptyEquippedSet,
  equip,
  equipmentPowerScore,
  EQUIPMENT_SLOTS,
  salvage,
  unequip,
  upgrade,
  equipmentUpgradeCost,
  type EquipmentDef,
  type EquipmentWallet,
} from './equipment';
import { computePlayerStats } from './player';

const ironShortsword: EquipmentDef = {
  id: 'iron_shortsword',
  slot: 'weapon',
  rarity: 'common',
  name: 'Iron Shortsword',
  icon: '🗡️',
  description: '+2 Atk',
  stats: { atk: 2 },
  deckAdditions: [{ cardId: 'act_001', count: 2 }],
};

const drakehidePlate: EquipmentDef = {
  id: 'drakehide_plate',
  slot: 'armor',
  rarity: 'epic',
  name: 'Drakehide Plate',
  icon: '🥋',
  description: '+40 HP, +8 Def, 50% Pyre resist',
  stats: { maxHp: 40, def: 8, resistances: { pyre: 0.5 } },
  triggers: [{ kind: 'on_combo', combo: 'onslaught', healHp: 5 }],
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

const phoenixSignet: EquipmentDef = {
  id: 'phoenix_signet',
  slot: 'ring',
  rarity: 'rare',
  name: 'Phoenix Signet',
  icon: '💍',
  description: '+5% Crit, +10% Pyre damage',
  stats: { critChance: 0.05 },
  triggers: [{ kind: 'damage_type_bonus', type: 'pyre', pct: 0.10 }],
  setId: 'phoenix',
};

const phoenixHelm: EquipmentDef = {
  id: 'phoenix_crown',
  slot: 'helm',
  rarity: 'legendary',
  name: 'Phoenix Crown',
  icon: '👑',
  description: '+15 HP, set: Phoenix',
  stats: { maxHp: 15 },
  setId: 'phoenix',
};

const wallet: EquipmentWallet = { gold: 5000, soulShards: 2000, dustShards: 50 };

describe('Equipped set', () => {
  it('empty set has no slots filled', () => {
    const set = emptyEquippedSet();
    expect(Object.keys(set)).toHaveLength(0);
  });

  it('equip places def in correct slot', () => {
    const set = equip(emptyEquippedSet(), ironShortsword);
    expect(set.weapon?.id).toBe('iron_shortsword');
    expect(set.armor).toBeUndefined();
  });

  it('equip overwrites existing piece in same slot', () => {
    const otherWeapon: EquipmentDef = { ...ironShortsword, id: 'other', name: 'Other' };
    let set = equip(emptyEquippedSet(), ironShortsword);
    set = equip(set, otherWeapon);
    expect(set.weapon?.id).toBe('other');
  });

  it('unequip clears the slot', () => {
    let set = equip(emptyEquippedSet(), ironShortsword);
    set = unequip(set, 'weapon');
    expect(set.weapon).toBeUndefined();
  });

  it('unequip is a no-op on empty slot', () => {
    const set = unequip(emptyEquippedSet(), 'weapon');
    expect(set).toEqual({});
  });

  it('EQUIPMENT_SLOTS lists exactly 6 slots', () => {
    expect(EQUIPMENT_SLOTS).toHaveLength(6);
    expect(EQUIPMENT_SLOTS).toContain('weapon');
    expect(EQUIPMENT_SLOTS).toContain('amulet');
  });
});

describe('compileEquipment', () => {
  it('produces stat modifiers from each piece', () => {
    let set = equip(emptyEquippedSet(), ironShortsword);
    set = equip(set, drakehidePlate);
    const c = compileEquipment(set);
    // 1 modifier per piece (no set bonuses since they're different setIds)
    expect(c.modifiers).toHaveLength(2);
    expect(c.modifiers).toContainEqual({ atk: 2 });
    expect(c.modifiers).toContainEqual({ maxHp: 40, def: 8, resistances: { pyre: 0.5 } });
  });

  it('aggregates deck additions', () => {
    const set = equip(emptyEquippedSet(), ironShortsword);
    const c = compileEquipment(set);
    expect(c.deckAdditions).toEqual([{ cardId: 'act_001', count: 2 }]);
  });

  it('aggregates triggers from all pieces', () => {
    let set = equip(emptyEquippedSet(), drakehidePlate);
    set = equip(set, phoenixSignet);
    const c = compileEquipment(set);
    expect(c.triggers).toHaveLength(2);
    expect(c.triggers.some(t => t.kind === 'on_combo')).toBe(true);
    expect(c.triggers.some(t => t.kind === 'damage_type_bonus')).toBe(true);
  });

  it('upgrade tier scales numeric stats by 1.15 per tier', () => {
    const upgraded: EquipmentDef = { ...ironShortsword, upgradeTier: 2 };
    const set = equip(emptyEquippedSet(), upgraded);
    const c = compileEquipment(set);
    // base atk 2, tier 2: 2 * (1 + 2*0.15) = 2 * 1.3 = 2.6 → rounds to 3
    expect(c.modifiers[0]).toEqual({ atk: 3 });
  });

  it('upgrade tier does not scale critChance', () => {
    const upgraded: EquipmentDef = { ...phoenixSignet, upgradeTier: 5 };
    const set = equip(emptyEquippedSet(), upgraded);
    const c = compileEquipment(set);
    // Crit stays at 0.05 regardless of tier (special abilities don't scale)
    expect(c.modifiers[0].critChance).toBe(0.05);
  });

  it('feeds cleanly into computePlayerStats', () => {
    let set = equip(emptyEquippedSet(), ironShortsword);
    set = equip(set, drakehidePlate);
    set = equip(set, heartOfSigilkeeper);
    const c = compileEquipment(set);
    const stats = computePlayerStats({ level: 1, modifiers: c.modifiers });
    expect(stats.atk).toBe(2);
    expect(stats.maxHp).toBe(50 + 40);
    expect(stats.def).toBe(8);
    expect(stats.sigilSlots).toBe(4); // base 3 + amulet 1
    expect(stats.resistances.pyre).toBe(0.5);
  });
});

describe('compileEquipment — set bonuses', () => {
  it('Phoenix 2pc fires when 2 phoenix pieces equipped', () => {
    let set = equip(emptyEquippedSet(), phoenixSignet);
    set = equip(set, phoenixHelm);
    const c = compileEquipment(set);
    const phoenix2 = c.setBonuses.find(b => b.setId === 'phoenix' && b.tier === 2);
    expect(phoenix2).toBeDefined();
    expect(phoenix2?.description).toMatch(/Revive/);
    // Set bonus also adds its trigger
    expect(c.triggers.some(t => t.kind === 'on_low_hp')).toBe(true);
  });

  it('does NOT fire 2pc with only 1 piece of the set', () => {
    const set = equip(emptyEquippedSet(), phoenixSignet);
    const c = compileEquipment(set);
    expect(c.setBonuses).toHaveLength(0);
  });

  it('Sigilbound 2pc adds +1 Sigil Slot via modifier', () => {
    const sigilWeapon: EquipmentDef = { ...ironShortsword, id: 'sb_w', setId: 'sigilbound' };
    const sigilArmor: EquipmentDef = { ...drakehidePlate, id: 'sb_a', setId: 'sigilbound' };
    let set = equip(emptyEquippedSet(), sigilWeapon);
    set = equip(set, sigilArmor);
    const c = compileEquipment(set);
    expect(c.setBonuses[0]?.modifier.sigilSlots).toBe(1);
  });

  it('does NOT fire 4pc when only 3 pieces of set equipped', () => {
    const set: ReadonlyArray<EquipmentDef> = [
      { ...phoenixHelm },
      { ...phoenixSignet },
      { ...drakehidePlate, id: 'p_armor', setId: 'phoenix' },
    ];
    let s = emptyEquippedSet();
    for (const def of set) s = equip(s, def);
    const c = compileEquipment(s);
    const tiers = c.setBonuses.filter(b => b.setId === 'phoenix').map(b => b.tier);
    expect(tiers).toContain(2);
    expect(tiers).not.toContain(4);
  });

  it('fires 4pc when 4 set pieces equipped', () => {
    const all: ReadonlyArray<EquipmentDef> = [
      { ...phoenixHelm, slot: 'helm' },
      { ...phoenixSignet, slot: 'ring' },
      { ...drakehidePlate, id: 'p_armor', slot: 'armor', setId: 'phoenix' },
      { ...ironShortsword, id: 'p_w', slot: 'weapon', setId: 'phoenix' },
    ];
    let s = emptyEquippedSet();
    for (const def of all) s = equip(s, def);
    const c = compileEquipment(s);
    const tiers = c.setBonuses.filter(b => b.setId === 'phoenix').map(b => b.tier);
    expect(tiers).toContain(2);
    expect(tiers).toContain(4);
  });
});

describe('Crafting', () => {
  it('craftCost matches GDD scale', () => {
    expect(craftCost('common')).toBe(50);
    expect(craftCost('uncommon')).toBe(100);
    expect(craftCost('rare')).toBe(250);
    expect(craftCost('epic')).toBe(500);
    expect(craftCost('legendary')).toBe(1000);
  });

  it('canCraft true when wallet has enough soul shards', () => {
    expect(canCraft({ ...wallet, soulShards: 50 }, 'common')).toBe(true);
    expect(canCraft({ ...wallet, soulShards: 49 }, 'common')).toBe(false);
  });

  it('craft deducts soul shards on success', () => {
    const result = craft({ ...wallet, soulShards: 100 }, 'common');
    expect(result?.soulShards).toBe(50);
  });

  it('craft returns null on insufficient shards', () => {
    expect(craft({ ...wallet, soulShards: 10 }, 'epic')).toBeNull();
  });
});

describe('Upgrading', () => {
  it('equipmentUpgradeCost steps through GDD ladder', () => {
    expect(equipmentUpgradeCost(0)).toEqual({ gold: 50, dust: 1 });
    expect(equipmentUpgradeCost(1)).toEqual({ gold: 200, dust: 1 });
    expect(equipmentUpgradeCost(2)).toEqual({ gold: 600, dust: 2 });
    expect(equipmentUpgradeCost(3)).toEqual({ gold: 1500, dust: 2 });
    expect(equipmentUpgradeCost(4)).toEqual({ gold: 4000, dust: 3 });
  });

  it('equipmentUpgradeCost is null at +5 (cap)', () => {
    expect(equipmentUpgradeCost(5)).toBeNull();
  });

  it('upgrade increments tier and deducts gold + dust', () => {
    const r = upgrade(wallet, ironShortsword);
    expect(r?.def.upgradeTier).toBe(1);
    expect(r?.wallet.gold).toBe(wallet.gold - 50);
    expect(r?.wallet.dustShards).toBe(wallet.dustShards - 1);
  });

  it('upgrade fails when wallet is short', () => {
    const broke: EquipmentWallet = { gold: 0, soulShards: 0, dustShards: 0 };
    expect(upgrade(broke, ironShortsword)).toBeNull();
  });

  it('upgrade fails at tier cap', () => {
    const maxed: EquipmentDef = { ...ironShortsword, upgradeTier: 5 };
    expect(upgrade(wallet, maxed)).toBeNull();
  });

  it('canUpgrade accounts for both gold and dust', () => {
    expect(canUpgrade({ gold: 100, soulShards: 0, dustShards: 1 }, 0)).toBe(true);
    expect(canUpgrade({ gold: 49, soulShards: 0, dustShards: 1 }, 0)).toBe(false);
    expect(canUpgrade({ gold: 100, soulShards: 0, dustShards: 0 }, 0)).toBe(false);
  });
});

describe('Salvage', () => {
  it('canSalvage false for mythic, true otherwise', () => {
    expect(canSalvage(ironShortsword)).toBe(true);
    expect(canSalvage({ ...ironShortsword, rarity: 'mythic' })).toBe(false);
  });

  it('salvage adds soul + dust shards', () => {
    const r = salvage({ gold: 0, soulShards: 0, dustShards: 0 }, ironShortsword);
    // Common total = 5: ceil(5/2) = 3 soul, floor(5/2) = 2 dust
    expect(r?.soulShards).toBe(3);
    expect(r?.dustShards).toBe(2);
  });

  it('salvage scales with upgrade tier', () => {
    const upgraded = { ...ironShortsword, upgradeTier: 3 };
    const r = salvage({ gold: 0, soulShards: 0, dustShards: 0 }, upgraded);
    // total = 5 + 3*2 = 11 → ceil(11/2)=6 soul, floor(11/2)=5 dust
    expect(r?.soulShards).toBe(6);
    expect(r?.dustShards).toBe(5);
  });

  it('salvage returns null for mythic', () => {
    expect(salvage(wallet, { ...ironShortsword, rarity: 'mythic' })).toBeNull();
  });
});

describe('equipmentPowerScore', () => {
  it('empty set scores 0', () => {
    expect(equipmentPowerScore(emptyEquippedSet())).toBe(0);
  });

  it('weights by rarity', () => {
    const common = equip(emptyEquippedSet(), ironShortsword);
    const epic = equip(emptyEquippedSet(), drakehidePlate);
    const score1 = equipmentPowerScore(common);
    const score2 = equipmentPowerScore(epic);
    expect(score2).toBeGreaterThan(score1);
  });

  it('upgrade tiers boost score', () => {
    const base = equip(emptyEquippedSet(), drakehidePlate);
    const upgraded = equip(emptyEquippedSet(), { ...drakehidePlate, upgradeTier: 5 });
    expect(equipmentPowerScore(upgraded)).toBeGreaterThan(equipmentPowerScore(base));
  });

  it('a full legendary loadout outscores a full common loadout', () => {
    const commonSet = EQUIPMENT_SLOTS.reduce(
      (s, slot) => equip(s, { ...ironShortsword, id: `c_${slot}`, slot }),
      emptyEquippedSet(),
    );
    const legSet = EQUIPMENT_SLOTS.reduce(
      (s, slot) => equip(s, { ...ironShortsword, id: `l_${slot}`, slot, rarity: 'legendary' }),
      emptyEquippedSet(),
    );
    expect(equipmentPowerScore(legSet)).toBeGreaterThan(equipmentPowerScore(commonSet) * 10);
  });
});
