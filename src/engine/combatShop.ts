// Sigilbound combat shop — daily-rotating Action/Tactic vendor.
//
// Pure functions. The storage layer wraps these to persist purchases
// and ISO-day rollover. Mirrors Plotbound's dailyShop.ts shape so the UI
// patterns transfer without rewriting the React layer.
//
// Pricing (per GDD §Currencies + balance feel):
//   Common    Action:  150 gold       OR  10 crystals
//   Uncommon  Action:  350 gold       OR  25 crystals
//   Rare      Action:  800 gold       OR  60 crystals
//   Epic      Action:  2000 gold      OR 150 crystals
//   Legendary Action:  5000 gold      OR 400 crystals
// Tactics: 70% of Action price (smaller payoff per copy).

import type { Rarity, Perk } from './types';
import { allActions, allTactics, type ActionCardDef, type TacticCardDef } from './actionCards';
import { allEquipment } from './equipmentCatalog';
import type { EquipmentDef } from './equipment';
import { allTalents } from './talents';
import { createRng, type Rng } from './rng';

export interface CombatShopEntry {
  // Either action or tactic — checked via `kind`.
  kind: 'action' | 'tactic' | 'equipment' | 'talent';
  cardId: string;
  // Resolved def for convenience — UI doesn't need to look it up again.
  def: ActionCardDef | TacticCardDef | EquipmentDef | Perk;
  goldPrice: number;
  crystalPrice: number;
  copiesAvailable: number; // 3-5 based on rarity
}

const ACTION_GOLD: Record<Rarity, number> = {
  common: 150, uncommon: 350, rare: 800, epic: 2000, legendary: 5000, mythic: 10000,
};
const ACTION_CRYSTAL: Record<Rarity, number> = {
  common: 10, uncommon: 25, rare: 60, epic: 150, legendary: 400, mythic: 999,
};
const TACTIC_RATIO = 0.7;
const EQUIPMENT_RATIO = 2.5; // Equipment is more expensive
const TALENT_RATIO = 1.5;

export function priceFor(def: ActionCardDef | TacticCardDef | EquipmentDef | Perk, kind: CombatShopEntry['kind']): { gold: number; crystals: number } {
  const baseGold = ACTION_GOLD[def.rarity] ?? 150;
  const baseCrystal = ACTION_CRYSTAL[def.rarity] ?? 10;
  let ratio = 1;
  if (kind === 'tactic') ratio = TACTIC_RATIO;
  if (kind === 'equipment') ratio = EQUIPMENT_RATIO;
  if (kind === 'talent') ratio = TALENT_RATIO;
  
  return {
    gold: Math.round(baseGold * ratio),
    crystals: Math.round(baseCrystal * ratio),
  };
}

export function copiesForRarity(rarity: Rarity): number {
  switch (rarity) {
    case 'common': return 5;
    case 'uncommon': return 4;
    case 'rare': return 3;
    case 'epic': return 3;
    case 'legendary': return 2;
    case 'mythic': return 1;
    default: return 3;
  }
}

// Deterministic daily roll. The same `dayKey` produces the same 6 cards
// regardless of which player rolls — that's intentional so guides and
// economy balance can talk about "day-N stock" coherently. The reroll
// counter (passed in) salts the seed so manual rerolls show different cards.
const SHOP_SLOT_COUNT = 9; // 3x3 grid for each tab

export interface CombatShopRoll {
  cards: CombatShopEntry[];
  equipment: CombatShopEntry[];
  talents: CombatShopEntry[];
}

export function rollCombatShop(dayKey: string, rerollCount: number = 0): CombatShopRoll {
  const seed = hashStr(dayKey) ^ (rerollCount * 0x9e3779b1);
  const rng = createRng(seed);

  const actions = allActions();
  const tactics = allTactics();
  const equipment = allEquipment().filter(e => e.rarity === 'rare' || e.rarity === 'epic' || e.rarity === 'legendary' || e.rarity === 'mythic');
  const talents = allTalents().filter(t => t.id !== 'talent.battlecry' && t.id !== 'talent.vigorous');

  const cardsEntries: CombatShopEntry[] = [];
  const equipEntries: CombatShopEntry[] = [];
  const talentEntries: CombatShopEntry[] = [];

  // 1. Roll Cards Tab
  for (let i = 0; i < SHOP_SLOT_COUNT; i++) {
    const isAction = rng.next() < 0.7;
    const filtered = isAction ? pickByRarityWeights(actions, rng) : pickByRarityWeights(tactics, rng);
    if (!filtered) continue;
    const kind = isAction ? 'action' : 'tactic';
    const price = priceFor(filtered, kind);
    cardsEntries.push({
      kind,
      cardId: filtered.id,
      def: filtered,
      goldPrice: price.gold,
      crystalPrice: price.crystals,
      copiesAvailable: copiesForRarity(filtered.rarity)
    });
  }

  // 2. Roll Equipment Tab (Gems Only)
  for (let i = 0; i < SHOP_SLOT_COUNT; i++) {
    if (equipment.length === 0) break;
    const filtered = equipment[rng.int(equipment.length)];
    const price = priceFor(filtered, 'equipment');
    equipEntries.push({
      kind: 'equipment',
      cardId: filtered.id,
      def: filtered,
      goldPrice: Infinity, // Gems only
      crystalPrice: price.crystals,
      copiesAvailable: copiesForRarity(filtered.rarity)
    });
  }

  // 3. Roll Talent Tab
  for (let i = 0; i < SHOP_SLOT_COUNT; i++) {
    if (talents.length === 0) break;
    const filtered = pickByRarityWeights(talents, rng);
    if (!filtered) continue;
    const price = priceFor(filtered, 'talent');
    talentEntries.push({
      kind: 'talent',
      cardId: filtered.id,
      def: filtered,
      goldPrice: price.gold,
      crystalPrice: price.crystals,
      copiesAvailable: copiesForRarity(filtered.rarity)
    });
  }

  return { cards: cardsEntries, equipment: equipEntries, talents: talentEntries };
}

// Weighted rarity roll: common 50%, uncommon 30%, rare 15%, epic 4%, legendary 1%.
function pickByRarityWeights<T extends { rarity: Rarity }>(pool: ReadonlyArray<T>, rng: Rng): T | undefined {
  const r = rng.next();
  let target: Rarity;
  if (r < 0.5) target = 'common';
  else if (r < 0.8) target = 'uncommon';
  else if (r < 0.95) target = 'rare';
  else if (r < 0.99) target = 'epic';
  else target = 'legendary';

  // Filter pool to that rarity. Fall back to common if empty.
  let candidates = pool.filter(c => c.rarity === target);
  if (candidates.length === 0) candidates = pool.filter(c => c.rarity === 'common');
  if (candidates.length === 0) return undefined;
  return candidates[rng.int(candidates.length)];
}

function hashStr(s: string): number {
  // Simple FNV-ish hash. Stable across runs.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

// Reroll cost ladder. Each manual reroll today costs more crystals than
// the last to discourage spam. Returns the cost for the *next* reroll
// given how many have already been used.
const REROLL_CRYSTAL_LADDER: ReadonlyArray<number> = [10, 25, 50, 100, 200];
export function rerollCostFor(rerollsUsedToday: number): number {
  return REROLL_CRYSTAL_LADDER[Math.min(rerollsUsedToday, REROLL_CRYSTAL_LADDER.length - 1)];
}
