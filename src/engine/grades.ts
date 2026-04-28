// Card grades F → A. Affect sell price (multiplier) and gate progression
// (player must own duplicates and pay coins to upgrade a card from one grade
// to the next). Tools have no grade — only seed cards do.

import type { Rarity } from './types';

export type Grade = 'F' | 'E' | 'D' | 'C' | 'B' | 'A';

export const GRADE_ORDER: Grade[] = ['F', 'E', 'D', 'C', 'B', 'A'];

// Sell-price multiplier per grade. F is the base; each step roughly +25%
// compounding so an A card sells for ~3x what an F sells for.
export const GRADE_MULTIPLIER: Record<Grade, number> = {
  F: 1.0,
  E: 1.25,
  D: 1.55,
  C: 1.95,
  B: 2.45,
  A: 3.00,
};

// Multiply a base sell price by the grade multiplier and round to int.
// Centralised so harvest math, draft preview, and tooltip text all agree.
export function gradedSellPrice(basePrice: number, grade: Grade): number {
  return Math.round(basePrice * GRADE_MULTIPLIER[grade]);
}

// Returns the next grade up, or null if already at A (max).
export function nextGrade(g: Grade): Grade | null {
  const i = GRADE_ORDER.indexOf(g);
  if (i < 0 || i >= GRADE_ORDER.length - 1) return null;
  return GRADE_ORDER[i + 1];
}

// Upgrade cost: how many duplicate cards (of the SAME id and SAME current
// grade) must be sacrificed, plus how many coins, to bump one copy up to the
// next grade. Higher current-grade upgrades cost more on both axes; rarer
// cards cost more per step than commons.
export interface UpgradeCost {
  duplicates: number; // copies of the SAME card+grade consumed (in addition to the one being upgraded)
  coins: number;
}

// Cost table indexed by [rarity][currentGrade]. Returns null if card is
// already at A. Tuned conservatively per the user's example (F→E common = 20
// dupes + 100 coins): higher grades scale ~1.6x dupes and ~3.5x coins.
const COST_TABLE: Record<Rarity, Partial<Record<Grade, UpgradeCost>>> = {
  common: {
    F: { duplicates: 20, coins: 100 },
    E: { duplicates: 30, coins: 350 },
    D: { duplicates: 45, coins: 1200 },
    C: { duplicates: 65, coins: 4000 },
    B: { duplicates: 90, coins: 12000 },
  },
  uncommon: {
    F: { duplicates: 14, coins: 200 },
    E: { duplicates: 22, coins: 700 },
    D: { duplicates: 32, coins: 2400 },
    C: { duplicates: 48, coins: 8000 },
    B: { duplicates: 70, coins: 24000 },
  },
  rare: {
    F: { duplicates: 10, coins: 400 },
    E: { duplicates: 16, coins: 1400 },
    D: { duplicates: 24, coins: 4800 },
    C: { duplicates: 36, coins: 16000 },
    B: { duplicates: 54, coins: 48000 },
  },
  epic: {
    F: { duplicates: 7,  coins: 800 },
    E: { duplicates: 12, coins: 2800 },
    D: { duplicates: 18, coins: 9500 },
    C: { duplicates: 27, coins: 32000 },
    B: { duplicates: 40, coins: 95000 },
  },
  legendary: {
    F: { duplicates: 5,  coins: 1600 },
    E: { duplicates: 8,  coins: 5600 },
    D: { duplicates: 13, coins: 19000 },
    C: { duplicates: 20, coins: 64000 },
    B: { duplicates: 30, coins: 190000 },
  },
  mythic: {
    F: { duplicates: 3,  coins: 3200 },
    E: { duplicates: 5,  coins: 11200 },
    D: { duplicates: 8,  coins: 38000 },
    C: { duplicates: 13, coins: 128000 },
    B: { duplicates: 20, coins: 380000 },
  },
};

export function upgradeCost(rarity: Rarity, fromGrade: Grade): UpgradeCost | null {
  return COST_TABLE[rarity][fromGrade] ?? null;
}

// Color hint for grade badges across the UI. Picked to read against both
// parchment and dark backgrounds without retuning per-screen.
export const GRADE_COLOR: Record<Grade, string> = {
  F: '#a1887f',
  E: '#90caf9',
  D: '#a5d6a7',
  C: '#ffd54f',
  B: '#ffab76',
  A: '#ff80ab',
};
