// Phase 5 — Battle Pass math + perk pricing.
// Pure functions; no side effects. Mirrored on the cloud side for atomic reward grants.

import bpRewards from '@data/bp_rewards.json';
import type { RunResult } from './types';
import type { Rarity } from './types';

export type BpRewardType = 'coins' | 'gems' | 'shards' | 'perk';

export interface BpReward {
  type: BpRewardType;
  value: number | string;   // number for coins/gems/shards, perk id for perk
}

export interface BpTier {
  tier: number;             // 1-based
  free: BpReward | null;    // null if no free reward at this tier
  premium: BpReward | null; // null if no premium reward at this tier
}

const ALL_TIERS = bpRewards as BpTier[];
export const TOTAL_BP_TIERS = 40;
export const XP_PER_TIER = 1000;

export function allBpTiers(): BpTier[] {
  return ALL_TIERS.slice();
}

export function bpTierFromXp(xp: number): number {
  // Tier index is 1-based and capped at TOTAL_BP_TIERS.
  return Math.max(1, Math.min(TOTAL_BP_TIERS, Math.floor(xp / XP_PER_TIER) + 1));
}

export function xpToNextTier(xp: number): { current: number; next: number; pct: number } {
  const tier = bpTierFromXp(xp);
  const tierFloorXp = (tier - 1) * XP_PER_TIER;
  const tierCeilXp = tier * XP_PER_TIER;
  const pct = Math.min(100, Math.round(((xp - tierFloorXp) / XP_PER_TIER) * 100));
  return { current: xp - tierFloorXp, next: tierCeilXp - tierFloorXp, pct };
}

// Phase 5 XP grant: 100 base + finalCoins/4. So a 200-coin win gives 150 XP,
// a 1000-coin run gives 350 XP. Tunable from this single source of truth.
export function xpFromRunResult(result: RunResult): number {
  return Math.round(100 + result.finalCoins / 4);
}

// Per-rarity perk pricing. Used for both gem store + shard crafting (gems are
// the convenience currency, shards are the slow-grind currency per GDD).
// Perks are now CONSUMABLE — each purchased perk grants 1 use that's burned
// when a run starts with it equipped. Lower rarities are cheap and can be
// paid for with coins (so a player can grind runs and stock up); higher
// rarities still go through the gem / shard premium pipes.
const PERK_GEM_COST: Record<Rarity, number> = {
  common: 25, uncommon: 60, rare: 200, epic: 600, legendary: 2500, mythic: 6000,
};

const PERK_SHARD_COST: Record<Rarity, number> = {
  common: 30, uncommon: 75, rare: 200, epic: 400, legendary: 800, mythic: 1500,
};

// Coin price — only the bottom three rarities are coin-purchasable. Anything
// epic+ requires a gems / shards purchase. Returns null when coins aren't an
// option for this rarity.
const PERK_COIN_COST: Partial<Record<Rarity, number>> = {
  common: 80,
  uncommon: 240,
  rare: 700,
};

export function perkCost(rarity: Rarity, currency: 'gems' | 'shards'): number {
  return currency === 'gems' ? PERK_GEM_COST[rarity] : PERK_SHARD_COST[rarity];
}

export function perkCoinCost(rarity: Rarity): number | null {
  return PERK_COIN_COST[rarity] ?? null;
}

// Phase 5 dev-mode price. Real RevenueCat IAP comes in Phase 6.
export const PREMIUM_PASS_GEM_COST = 300;
