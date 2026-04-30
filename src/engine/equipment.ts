// Sigilbound equipment system.
//
// 6 slots × 6 rarities × ~96 pieces at launch (data file in Phase 4).
// Equipment compiles down to:
//   - StatModifier[]  → fed into computePlayerStats()
//   - deckAdditions[] → cardIds added to the run deck on stage start
//   - reactionAdditions[] → reaction-card ids added to the reaction deck
//   - triggers[]      → special on-equip / on-event abilities (data only;
//                        the runner reads these and decides what to do)
//
// Crafting + upgrading + salvage live here too. They're pure functions over
// a `EquipmentWallet` (gold + soul shards + dust shards). The storage layer
// will wrap these with localStorage / Firestore writes in Phase 5.
//
// All public functions are pure: same input → same output. Cloud replay
// can call them with a snapshot to verify a player's equipment state.

import type { CardId, Rarity } from './types';
import type { DamageType, Resistances } from './damage';
import type { StatModifier } from './player';
import { levelStatMultiplier } from './cardLevels';

// === Slots ===

export type EquipmentSlot = 'weapon' | 'offhand' | 'helm' | 'armor' | 'ring' | 'amulet';

export const EQUIPMENT_SLOTS: ReadonlyArray<EquipmentSlot> = [
  'weapon', 'offhand', 'helm', 'armor', 'ring', 'amulet',
];

// === Triggers ===
//
// Equipment specials beyond plain stats. The runner reads these and decides
// when to fire them. Each trigger has the same shape as a reaction patch
// (since semantically they're "equipment-driven reactions"), but they live
// on the equipment itself so they don't need to enter the reaction deck.

export type EquipmentTrigger =
  | { kind: 'on_combo'; combo: 'onslaught' | 'triadic' | 'relentless'; healHp?: number; bonusDamagePct?: number }
  | { kind: 'on_kill'; healHp?: number; bonusGold?: number }
  | { kind: 'on_stage_start'; addBlock?: number; healHp?: number }
  | { kind: 'on_low_hp'; threshold: number; reviveAtHpPct?: number; addBlock?: number; oncePerStage: boolean }
  | { kind: 'on_negate_hit'; oncePerStage: boolean }                  // Bulwark Aegis
  | { kind: 'damage_type_bonus'; type: DamageType; pct: number }      // Phoenix Signet
  | { kind: 'on_crit'; healHp?: number; applyBurnStacks?: number }    // Dragonfang Sabre
  | { kind: 'on_first_strike_per_stage'; autoCrit?: boolean }         // Hunter set 4pc
  | { kind: 'first_charged_action_speed'; turns: number }             // Glacier Spear
  | { kind: 'extra_first_block_carry'; pct: number }                  // Plate of Eternal Vigil
  | { kind: 'noop' };

// === EquipmentDef ===
//
// Static template. Data files in Phase 4 produce arrays of these.

export interface EquipmentDef {
  id: string;                  // 'iron_shortsword', 'phoenix_signet'
  slot: EquipmentSlot;
  rarity: Rarity;
  name: string;
  icon: string;                // emoji placeholder; later swapped for asset
  description: string;
  // Numeric stats. Compiled into StatModifier when equipped.
  stats: {
    maxHp?: number;
    atk?: number;
    def?: number;
    critChance?: number;
    speed?: number;
    stamina?: number;
    sigilSlots?: number;
    handSize?: number;
    resistances?: Resistances;
  };
  // Cards added to the run deck on stage start. Marked equipment-sourced
  // so they don't bleed into the persistent collection.
  deckAdditions?: ReadonlyArray<{ cardId: CardId; count: number }>;
  // Reaction cards added to the reaction deck on stage start.
  reactionAdditions?: ReadonlyArray<string>;
  // Special triggers (each fires according to its kind).
  triggers?: ReadonlyArray<EquipmentTrigger>;
  // Mythic set membership. 2pc/4pc bonuses keyed off the set id.
  setId?: string;
  // Upgrade tier 0..5. Always 0 for fresh drops; +N copies inherit base
  // stats and apply the upgrade table on top.
  upgradeTier?: number;
}

// === EquippedSet (the loadout) ===

export type EquippedSet = Partial<Record<EquipmentSlot, EquipmentDef>>;

export function emptyEquippedSet(): EquippedSet {
  return {};
}

// === Wallet (currencies for crafting + upgrading + salvage) ===

export interface EquipmentWallet {
  gold: number;
  soulShards: number;
  dustShards: number;
}

// === Compile the equipped set down to runtime values ===
//
// The battle runner calls this to learn what stats / cards / reactions
// a battle should start with given the player's current loadout.

export interface CompiledEquipment {
  modifiers: StatModifier[];
  deckAdditions: Array<{ cardId: CardId; count: number }>;
  reactionAdditions: string[];
  triggers: EquipmentTrigger[];
  // Active set bonuses. 0–6 entries each tied to a setId + tier (2 or 4).
  setBonuses: Array<{ setId: string; tier: 2 | 4; modifier: StatModifier; description: string }>;
}

export function compileEquipment(set: EquippedSet, levels?: Record<string, number>): CompiledEquipment {
  const out: CompiledEquipment = {
    modifiers: [],
    deckAdditions: [],
    reactionAdditions: [],
    triggers: [],
    setBonuses: [],
  };

  // Per-piece stat modifiers + deck/reaction/trigger additions.
  for (const slot of EQUIPMENT_SLOTS) {
    const def = set[slot];
    if (!def) continue;

    // Numeric stat scaling. If a level map is provided, use the universal
    // 1..10 ladder (level 1 = 0.6× authored, level 10 = 1.275×). Otherwise
    // fall back to the legacy `def.upgradeTier` (0..5) at +15% per tier
    // — preserves the parallel craft/upgrade/salvage test surface that
    // doesn't use the universal level system.
    const lookupLevel = levels?.[def.id];
    const tierMult = lookupLevel !== undefined
      ? levelStatMultiplier(lookupLevel)
      : 1 + (def.upgradeTier ?? 0) * 0.15;
    const mod: StatModifier = {};
    if (def.stats.maxHp) mod.maxHp = Math.round(def.stats.maxHp * tierMult);
    if (def.stats.atk) mod.atk = Math.round(def.stats.atk * tierMult);
    if (def.stats.def) mod.def = Math.round(def.stats.def * tierMult);
    if (def.stats.critChance) mod.critChance = def.stats.critChance; // crits don't tier-scale
    if (def.stats.speed) mod.speed = def.stats.speed;
    if (def.stats.stamina) mod.stamina = def.stats.stamina;
    if (def.stats.sigilSlots) mod.sigilSlots = def.stats.sigilSlots;
    if (def.stats.handSize) mod.handSize = def.stats.handSize;
    if (def.stats.resistances) mod.resistances = { ...def.stats.resistances };
    if (Object.keys(mod).length > 0) out.modifiers.push(mod);

    if (def.deckAdditions) for (const add of def.deckAdditions) out.deckAdditions.push({ ...add });
    if (def.reactionAdditions) for (const r of def.reactionAdditions) out.reactionAdditions.push(r);
    if (def.triggers) for (const t of def.triggers) out.triggers.push(t);
  }

  // Set bonuses. Group by setId, count members, apply 2pc / 4pc.
  const setCounts = new Map<string, number>();
  for (const slot of EQUIPMENT_SLOTS) {
    const def = set[slot];
    if (!def?.setId) continue;
    setCounts.set(def.setId, (setCounts.get(def.setId) ?? 0) + 1);
  }
  for (const [setId, count] of setCounts) {
    if (count >= 2) {
      const bonus = SET_BONUSES_2PC[setId];
      if (bonus) {
        out.setBonuses.push({ setId, tier: 2, modifier: bonus.modifier, description: bonus.description });
        out.modifiers.push(bonus.modifier);
        if (bonus.triggers) for (const t of bonus.triggers) out.triggers.push(t);
      }
    }
    if (count >= 4) {
      const bonus = SET_BONUSES_4PC[setId];
      if (bonus) {
        out.setBonuses.push({ setId, tier: 4, modifier: bonus.modifier, description: bonus.description });
        out.modifiers.push(bonus.modifier);
        if (bonus.triggers) for (const t of bonus.triggers) out.triggers.push(t);
      }
    }
  }

  return out;
}

// === Mythic set bonuses (per GDD §Equipment Data table) ===
//
// 6 sets at launch. Each has a 2pc + 4pc tier. The data lives in code
// because the math is small + every set has its own behaviour (pure data
// JSON would still need a code-side dispatch). Phase 4 may move these
// into a registered-trigger system if the count grows.

interface SetBonus {
  modifier: StatModifier;
  triggers?: EquipmentTrigger[];
  description: string;
}

const SET_BONUSES_2PC: Record<string, SetBonus> = {
  phoenix: {
    modifier: {},
    triggers: [{ kind: 'on_low_hp', threshold: 0.25, reviveAtHpPct: 0.25, oncePerStage: true }],
    description: 'Phoenix 2pc: Revive once at 25% HP per stage.',
  },
  glacier: {
    modifier: { def: 5 }, // approximate "+15% block" via flat def for v1
    description: 'Glacier 2pc: +5 def from frost mastery.',
  },
  wraith: {
    modifier: {},
    // Bonus damage at <50% HP — encoded as a damage_type_bonus on no specific
    // type means "global +10%" handled by the runner reading triggers.
    triggers: [{ kind: 'damage_type_bonus', type: 'arcane', pct: 0.10 }],
    description: 'Wraith 2pc: +10% Arcane damage when low HP.',
  },
  warden: {
    modifier: { maxHp: 20 }, // "+10 max HP per piece worn" approximated
    description: 'Warden 2pc: +20 max HP from steel discipline.',
  },
  hunter: {
    modifier: {},
    triggers: [{ kind: 'damage_type_bonus', type: 'pierce', pct: 0.15 }],
    description: 'Hunter 2pc: +15% Pierce damage.',
  },
  sigilbound: {
    modifier: { sigilSlots: 1 },
    description: 'Sigilbound 2pc: +1 Sigil Slot.',
  },
};

const SET_BONUSES_4PC: Record<string, SetBonus> = {
  phoenix: {
    modifier: {},
    description: 'Phoenix 4pc: Burn deals 2× damage (handled in runner).',
  },
  glacier: {
    modifier: {},
    description: 'Glacier 4pc: Frostbite skips enemy turn at 5+ stacks.',
  },
  wraith: {
    modifier: {},
    description: 'Wraith 4pc: Soul Drain heals 100% damage dealt.',
  },
  warden: {
    modifier: { critChance: 0.05 },
    description: 'Warden 4pc: +5% crit per Steel piece.',
  },
  hunter: {
    modifier: {},
    triggers: [{ kind: 'on_first_strike_per_stage', autoCrit: true }],
    description: 'Hunter 4pc: First strike each stage auto-crits.',
  },
  sigilbound: {
    modifier: {},
    triggers: [{ kind: 'on_combo', combo: 'onslaught', bonusDamagePct: 0.50 }],
    description: 'Sigilbound 4pc: +50% damage on every combo.',
  },
};

// === Equip / unequip ===

export function equip(set: EquippedSet, def: EquipmentDef): EquippedSet {
  return { ...set, [def.slot]: def };
}

export function unequip(set: EquippedSet, slot: EquipmentSlot): EquippedSet {
  if (!set[slot]) return set;
  const next = { ...set };
  delete next[slot];
  return next;
}

// === Crafting ===
//
// Per GDD: Common 50, Uncommon 100, Rare 250, Epic 500, Legendary 1,000
// soul shards. Mythic crafting unlocks at level 30 + Mythic Forge upgrade
// — not modeled here; the Phase 5 storage wrapper does the gating.

const CRAFT_COSTS: Record<Rarity, number> = {
  common:    50,
  uncommon:  100,
  rare:      250,
  epic:      500,
  legendary: 1000,
  mythic:    5000,
};

export function craftCost(rarity: Rarity): number {
  return CRAFT_COSTS[rarity];
}

export function canCraft(wallet: EquipmentWallet, rarity: Rarity): boolean {
  return wallet.soulShards >= CRAFT_COSTS[rarity];
}

export function craft(
  wallet: EquipmentWallet,
  rarity: Rarity,
): EquipmentWallet | null {
  if (!canCraft(wallet, rarity)) return null;
  return { ...wallet, soulShards: wallet.soulShards - CRAFT_COSTS[rarity] };
}

// === Upgrading ===
//
// Each piece +1 → +5. Cost ladder per GDD: 50 → 200 → 600 → 1500 → 4000 gold,
// plus 1–3 dust shards per tier. We use 1/1/2/2/3 for the dust ladder.

const UPGRADE_GOLD: ReadonlyArray<number> = [50, 200, 600, 1500, 4000];
const UPGRADE_DUST: ReadonlyArray<number> = [1, 1, 2, 2, 3];

export function equipmentUpgradeCost(currentTier: number): { gold: number; dust: number } | null {
  // tier 0 → 1 = index 0; tier 4 → 5 = index 4. Tier 5 is the cap.
  if (currentTier < 0 || currentTier >= 5) return null;
  return { gold: UPGRADE_GOLD[currentTier], dust: UPGRADE_DUST[currentTier] };
}

export function canUpgrade(wallet: EquipmentWallet, currentTier: number): boolean {
  const cost = equipmentUpgradeCost(currentTier);
  if (!cost) return false;
  return wallet.gold >= cost.gold && wallet.dustShards >= cost.dust;
}

export function upgrade(
  wallet: EquipmentWallet,
  def: EquipmentDef,
): { wallet: EquipmentWallet; def: EquipmentDef } | null {
  const tier = def.upgradeTier ?? 0;
  if (!canUpgrade(wallet, tier)) return null;
  const cost = equipmentUpgradeCost(tier)!;
  return {
    wallet: { ...wallet, gold: wallet.gold - cost.gold, dustShards: wallet.dustShards - cost.dust },
    def: { ...def, upgradeTier: tier + 1 },
  };
}

// === Salvage ===
//
// Per GDD: Common = 5 shards, … Legendary = 80 shards. Half soul shards,
// half dust shards (rough split). Mythic items can't be salvaged (unique).

const SALVAGE_TOTAL: Record<Rarity, number> = {
  common:    5,
  uncommon:  12,
  rare:      25,
  epic:      45,
  legendary: 80,
  mythic:    0,           // can't salvage
};

export function canSalvage(def: EquipmentDef): boolean {
  return def.rarity !== 'mythic';
}

export function salvage(
  wallet: EquipmentWallet,
  def: EquipmentDef,
): EquipmentWallet | null {
  if (!canSalvage(def)) return null;
  const total = SALVAGE_TOTAL[def.rarity];
  // Upgraded pieces salvage for more (matches the sunk gold/dust).
  const tierBonus = (def.upgradeTier ?? 0) * 2;
  const soul = Math.ceil((total + tierBonus) / 2);
  const dust = Math.floor((total + tierBonus) / 2);
  return {
    ...wallet,
    soulShards: wallet.soulShards + soul,
    dustShards: wallet.dustShards + dust,
  };
}

// === Power score (used by PvP matchmaker) ===
//
// Simple sum of rarity weights, scaled by upgrade tier. Phase 4 will fold
// this into the matchmaker's combined power score (talent×1 + equipment×0.6).

const RARITY_POWER: Record<Rarity, number> = {
  common:    1,
  uncommon:  3,
  rare:      6,
  epic:      12,
  legendary: 25,
  mythic:    50,
};

export function equipmentPowerScore(set: EquippedSet): number {
  let score = 0;
  for (const slot of EQUIPMENT_SLOTS) {
    const def = set[slot];
    if (!def) continue;
    const tier = def.upgradeTier ?? 0;
    score += RARITY_POWER[def.rarity] * (1 + tier * 0.15);
  }
  return Math.round(score);
}
