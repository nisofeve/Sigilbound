// Sigilbound Phase 3 — Drop Table Engine
//
// Governs what items players receive as stage clear rewards:
//   - Combat cards: always available, seeded by stage
//   - Equipment: drops from "strong" stages (difficulty band ≥ medium, stage ≥ 8)
//     - Low-tier (common/uncommon) from medium stages
//     - Mid/high-tier (rare+) ONLY from the shop or gem purchase (per design doc)
//   - Talents: consumable charges drop on 3-star clears only
//     - Starter talents (battlecry, vigorous) never drop as consumables
//
// All rolls are seeded so stage N always gives the same possible drops —
// players can look up what to farm without RNG variance between accounts.

import { createRng } from './rng';
import { allEquipment } from './equipmentCatalog';
import { allTalents } from './talents';
import { allActions, allTactics } from './actionCards';
import type { EquipmentDef } from './equipment';
import type { Perk } from './types';
import type { Rarity } from './types';
import type { CombatStageDef } from './stageDef';

// === Drop types ===

export interface CombatCardDrop {
  kind: 'combat_card';
  cardId: string;
  count: number;
}

export interface EquipmentDrop {
  kind: 'equipment';
  equipmentId: string;
  count: 1;
}

export interface TalentDrop {
  kind: 'talent';
  talentId: string;
  count: number;
}

export type ItemDrop = CombatCardDrop | EquipmentDrop | TalentDrop;

// Extended reward with item drops layered on top of the currency rewards
export interface CombatDropResult {
  coins: number;
  xp: number;
  gems: number;
  shards: number;
  // First-clear-only item drops (empty on replays)
  itemDrops: ItemDrop[];
  // Whether this was a first-clear at this star tier
  isFirstClear: boolean;
}

// === Starters that must never appear as consumable drops ===
const STARTER_TALENT_IDS = new Set(['talent.battlecry', 'talent.vigorous']);

// === Rarity weight tables ===

const CARD_RARITY_WEIGHTS_BY_BAND: Record<CombatStageDef['difficultyBand'], Partial<Record<Rarity, number>>> = {
  tutorial: { common: 1 },
  easy:     { common: 6, uncommon: 3 },
  medium:   { common: 4, uncommon: 4, rare: 2 },
  hard:     { common: 2, uncommon: 4, rare: 3, epic: 1 },
  final:    { uncommon: 2, rare: 4, epic: 3, legendary: 1 },
};

// Equipment ONLY drops from stages with strong enemies (band medium+, stage >= 8)
// Mid/high tier gear (rare+) is shop-only per design doc — only common/uncommon drop here
const EQUIP_RARITY_WEIGHTS_BY_BAND: Record<CombatStageDef['difficultyBand'], Partial<Record<Rarity, number>> | null> = {
  tutorial: null,
  easy:     null,
  medium:   { common: 5, uncommon: 3 },
  hard:     { common: 3, uncommon: 5, rare: 2 },
  final:    { common: 1, uncommon: 4, rare: 4, epic: 1 },
};

// Talent drops: 3-star first clear only, starts at stage 10
const TALENT_RARITY_WEIGHTS_BY_BAND: Record<CombatStageDef['difficultyBand'], Partial<Record<Rarity, number>> | null> = {
  tutorial: null,
  easy:     null,
  medium:   { common: 5, uncommon: 4 },
  hard:     { common: 2, uncommon: 4, rare: 3 },
  final:    { uncommon: 2, rare: 4, epic: 2, legendary: 1 },
};

// === RNG helpers ===

function weightedPick<T>(
  pool: ReadonlyArray<T & { rarity: Rarity }>,
  weights: Partial<Record<Rarity, number>>,
  rng: ReturnType<typeof createRng>,
): T | null {
  const eligible = pool.filter(item => (weights[item.rarity] ?? 0) > 0);
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, item) => sum + (weights[item.rarity] ?? 0), 0);
  let roll = rng.next() * totalWeight;
  for (const item of eligible) {
    roll -= weights[item.rarity] ?? 0;
    if (roll <= 0) return item;
  }
  return eligible[eligible.length - 1];
}

// === Main drop roller ===

/**
 * Roll item drops for a combat stage clear.
 *
 * @param stage  The stage definition (provides band, number, isBoss)
 * @param stars  Stars earned this run (0 = defeat, no drops)
 * @param isFirstClear  Whether this is the first time clearing at this tier
 * @returns  Array of item drops to grant to the player
 */
export function rollStageDrops(
  stage: CombatStageDef,
  stars: 0 | 1 | 2 | 3,
  isFirstClear: boolean,
): ItemDrop[] {
  // No drops on defeat or replay (we only grant item drops on first-clears)
  if (stars === 0 || !isFirstClear) return [];

  // Seed from stage number + star tier so the same first-clear always offers the same loot
  const seed = (stage.number * 0x9e3779b1) ^ (stars * 0x517cc1b7);
  const rng = createRng(seed >>> 0);

  const drops: ItemDrop[] = [];
  const band = stage.difficultyBand;

  // 1. Combat card drop — always on first clear of any stage
  const cardDrop = rollCombatCardDrop(band, stage.number, stars, rng);
  if (cardDrop) drops.push(cardDrop);

  // 2. Equipment drop — only on medium+ stages (stage >= 8), with increasing probability
  if (stage.number >= 8) {
    const equipDrop = rollEquipmentDrop(band, stage.number, stars, rng);
    if (equipDrop) drops.push(equipDrop);
  }

  // 3. Talent drop — only on 3-star clears (stage >= 10)
  if (stars === 3 && stage.number >= 10) {
    const talentDrop = rollTalentDrop(band, stage.number, rng);
    if (talentDrop) drops.push(talentDrop);
  }

  // Boss stages get a bonus drop (extra card + higher talent chance)
  if (stage.isBoss && stars >= 2) {
    const bonusCard = rollCombatCardDrop(band, stage.number, stars, rng);
    if (bonusCard && bonusCard.cardId !== cardDrop?.cardId) {
      // Different card — add as bonus
      drops.push({ ...bonusCard, count: 1 });
    }
  }

  return drops;
}

function rollCombatCardDrop(
  band: CombatStageDef['difficultyBand'],
  stageNum: number,
  stars: 1 | 2 | 3,
  rng: ReturnType<typeof createRng>,
): CombatCardDrop | null {
  const weights = CARD_RARITY_WEIGHTS_BY_BAND[band];
  const isAction = rng.next() < 0.65; // 65% action, 35% tactic
  // Cast to a minimal shape with just id + rarity so weightedPick can handle either kind.
  type CardEntry = { id: string; rarity: Rarity };
  const pool: ReadonlyArray<CardEntry> = isAction
    ? (allActions() as ReadonlyArray<CardEntry>)
    : (allTactics() as ReadonlyArray<CardEntry>);
  const picked = weightedPick(pool, weights, rng);
  if (!picked) return null;

  // 3-star gives 2 copies; others give 1; boss stages can give up to 3
  const count = stars === 3 ? (stageNum >= 50 ? 3 : 2) : 1;
  return { kind: 'combat_card', cardId: picked.id, count };
}

function rollEquipmentDrop(
  band: CombatStageDef['difficultyBand'],
  _stageNum: number,
  stars: 1 | 2 | 3,
  rng: ReturnType<typeof createRng>,
): EquipmentDrop | null {
  const weights = EQUIP_RARITY_WEIGHTS_BY_BAND[band];
  if (!weights) return null;

  // Equipment drops are rarer — roll probability first
  // 1-star: 30% chance, 2-star: 55% chance, 3-star: 80% chance
  const threshold = stars === 3 ? 0.80 : stars === 2 ? 0.55 : 0.30;
  if (rng.next() > threshold) return null;

  // Only low-tier gear from drops (common/uncommon) per design doc
  const eligiblePool = allEquipment().filter(
    e => e.rarity === 'common' || e.rarity === 'uncommon'
  );
  const picked = weightedPick(eligiblePool as ReadonlyArray<EquipmentDef & { rarity: Rarity }>, weights, rng);
  if (!picked) return null;

  return { kind: 'equipment', equipmentId: picked.id, count: 1 };
}

function rollTalentDrop(
  band: CombatStageDef['difficultyBand'],
  _stageNum: number,
  rng: ReturnType<typeof createRng>,
): TalentDrop | null {
  const weights = TALENT_RARITY_WEIGHTS_BY_BAND[band];
  if (!weights) return null;

  // Filter out starters — they are always permanently owned, never consumable
  const eligiblePool = allTalents().filter(t => !STARTER_TALENT_IDS.has(t.id));
  const picked = weightedPick(eligiblePool as ReadonlyArray<Perk & { rarity: Rarity }>, weights, rng);
  if (!picked) return null;

  return { kind: 'talent', talentId: picked.id, count: 1 };
}

// === Catalogue helpers (for UI: "what can drop at stage N?") ===

/**
 * Returns possible equipment drops for a stage so the stage info modal
 * can show "Possible drops: [icon] [icon]" without spoiling exact items.
 */
export function possibleEquipmentDrops(stage: CombatStageDef): ReadonlyArray<EquipmentDef> {
  const weights = EQUIP_RARITY_WEIGHTS_BY_BAND[stage.difficultyBand];
  if (!weights || stage.number < 8) return [];
  return allEquipment().filter(
    e => (weights[e.rarity] ?? 0) > 0 && (e.rarity === 'common' || e.rarity === 'uncommon')
  );
}

/**
 * Returns whether a talent can possibly drop from this stage (3-star only).
 */
export function talentsCanDropAtStage(stage: CombatStageDef): boolean {
  return stage.number >= 10 && TALENT_RARITY_WEIGHTS_BY_BAND[stage.difficultyBand] !== null;
}
