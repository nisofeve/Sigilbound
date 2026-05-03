// Universal card-level + upgrade system for Sigilbound combat.
//
// Every upgradable card (Action, Tactic, Equipment) shares the same level
// ladder: levels 1..10, 9 upgrades total. Each upgrade consumes copies of
// the same card plus a gold fee. Higher rarities need fewer copies (rarer
// drops/shop appearances) but more gold per upgrade.
//
// Stat scaling is multiplicative — level 1 is the new baseline (60% of the
// def's authored value, intentionally weak) and level 10 ramps to ~1.275×
// the authored value. The same multiplier is applied to action damage,
// tactic effect amounts, and equipment numeric stats so the upgrade UI
// feels consistent across systems.
//
// Talents are explicitly NOT upgradable — they're consumable charges. The
// starter perks (battlecry / vigorous) stay flat at their authored values.

import type { Rarity } from './types';

// === Bounds ===

export const MIN_CARD_LEVEL = 1;
export const MAX_CARD_LEVEL = 10;

// === Stat scaling ===

const BASELINE_MULT = 0.6;
const PER_LEVEL_BONUS = 0.075;

export function levelStatMultiplier(level: number): number {
  const lv = clamp(level);
  return BASELINE_MULT + (lv - MIN_CARD_LEVEL) * PER_LEVEL_BONUS;
}

function clamp(level: number): number {
  if (!Number.isFinite(level)) return MIN_CARD_LEVEL;
  if (level < MIN_CARD_LEVEL) return MIN_CARD_LEVEL;
  if (level > MAX_CARD_LEVEL) return MAX_CARD_LEVEL;
  return Math.floor(level);
}

/** Multiply a numeric stat by the level multiplier. Defaults to integer round. */
export function scaleStatForLevel(value: number, level: number, round: boolean = true): number {
  const scaled = value * levelStatMultiplier(level);
  return round ? Math.round(scaled) : scaled;
}

export function clampCardLevel(level: number): number {
  return clamp(level);
}

// === Upgrade cost ladder ===

const BASE_COPIES_PER_UPGRADE: ReadonlyArray<number> = [
  1, 2, 3, 5, 7, 10, 14, 19, 25,
];

const BASE_GOLD_PER_UPGRADE: ReadonlyArray<number> = [
  100, 250, 500, 1000, 2000, 4000, 8000, 15000, 28000,
];

const RARITY_COPY_FACTOR: Record<Rarity, number> = {
  common:    1.00,
  uncommon:  0.75,
  rare:      0.55,
  epic:      0.40,
  legendary: 0.30,
  mythic:    0.20,
};

const RARITY_GOLD_FACTOR: Record<Rarity, number> = {
  common:    1.0,
  uncommon:  1.5,
  rare:      2.5,
  epic:      4.0,
  legendary: 7.0,
  mythic:    12.0,
};

export interface CardUpgradeCost {
  copies: number;
  gold: number;
}

export function cardUpgradeCostFor(currentLevel: number, rarity: Rarity): CardUpgradeCost | null {
  const lv = clamp(currentLevel);
  if (lv >= MAX_CARD_LEVEL) return null;
  const stepIdx = lv - MIN_CARD_LEVEL; // 0..8
  const baseCopies = BASE_COPIES_PER_UPGRADE[stepIdx];
  const baseGold = BASE_GOLD_PER_UPGRADE[stepIdx];
  const copies = Math.max(1, Math.round(baseCopies * RARITY_COPY_FACTOR[rarity]));
  const gold = Math.max(1, Math.round(baseGold * RARITY_GOLD_FACTOR[rarity]));
  return { copies, gold };
}

export function isCardMaxLevel(level: number): boolean {
  return clamp(level) >= MAX_CARD_LEVEL;
}

// F2: Card tier cap progresses with bosses defeated. Starts at 3, +1 per boss, capped at 10.
export function cardTierCapForBossCount(bossesDefeated: number): number {
  const cap = Math.min(MAX_CARD_LEVEL, 3 + bossesDefeated);
  return cap;
}
