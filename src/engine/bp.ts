// Battle Pass system — seasonal XP progression with free and VIP tracks.
//
// Seasons last 30 days. Players earn XP from combat clears, daily challenges,
// weekly challenges, and monthly challenges. Tiers 1–40 yield curated rewards
// (coins, gems, shards, perks, talent charges, cosmetics). Tiers 41–60 give
// generic escalating coin rewards as a long-tail catch-up loop.

// Period-based quest XP. Daily quests give modest XP; weekly meaningful; monthly grand.
export const QUEST_BP_XP: Record<string, number> = {
  easy: 150,
  medium: 300,
  hard: 500,
};

// Battle pass tier constants.
export const TOTAL_BP_TIERS = 60;
export const TOTAL_REWARD_TIERS = 40;        // T1–T40 are curated; T41–T60 are generic coins.
export const XP_PER_TIER = 500;
export const VIP_PASS_GEM_COST = 800;
// Legacy alias kept for any imports during migration.
export const PREMIUM_PASS_GEM_COST = VIP_PASS_GEM_COST;

export type BpRewardType =
  | 'coins'
  | 'gems'
  | 'shards'
  | 'combat_card_copies'
  | 'talent_charge'
  | 'cosmetic'
  | 'perk';

export interface BpRewardItem {
  type: BpRewardType;
  value?: number | string;
}

export interface BpReward {
  tier: number;
  free?: BpRewardItem;
  premium?: BpRewardItem;  // Kept as 'premium' to preserve save compatibility (renamed in UI to "VIP").
}

// Generate the 60-tier reward table.
//
// T1–T10: Onboarding flow. Free track grants small coin/gem amounts. VIP doubles up.
// T11–T25: Mid-game. Mix in shards, talent charges, combat card copies.
// T26–T40: Late-game prestige rewards. Cosmetics, perks, larger gem packs.
// T41–T60: Generic coin rewards that scale up. Free 5k → 50k. VIP 2x.
export function allBpTiers(): BpReward[] {
  const tiers: BpReward[] = [];

  // Curated rewards table for T1–T40.
  // Each entry: [tier, freeType, freeValue, premiumType, premiumValue]
  // Use undefined to skip a side.
  type Row = {
    tier: number;
    free?: BpRewardItem;
    premium?: BpRewardItem;
  };
  const curated: Row[] = [
    // ── Onboarding T1–T10 ───────────────────────────────────────────────────
    { tier: 1,  free: { type: 'coins', value: 200 },                            premium: { type: 'gems', value: 50 } },
    { tier: 2,  free: { type: 'shards', value: 25 },                            premium: { type: 'coins', value: 500 } },
    { tier: 3,  free: { type: 'coins', value: 300 },                            premium: { type: 'shards', value: 50 } },
    { tier: 4,  free: { type: 'gems', value: 15 },                              premium: { type: 'gems', value: 60 } },
    { tier: 5,  free: { type: 'coins', value: 500 },                            premium: { type: 'combat_card_copies', value: 1 } },
    { tier: 6,  free: { type: 'shards', value: 30 },                            premium: { type: 'gems', value: 75 } },
    { tier: 7,  free: { type: 'coins', value: 600 },                            premium: { type: 'shards', value: 100 } },
    { tier: 8,  free: { type: 'gems', value: 20 },                              premium: { type: 'talent_charge', value: 1 } },
    { tier: 9,  free: { type: 'coins', value: 800 },                            premium: { type: 'gems', value: 100 } },
    { tier: 10, free: { type: 'gems', value: 30 },                              premium: { type: 'cosmetic', value: 'card_back_bronze' } },

    // ── Mid-game T11–T25 ────────────────────────────────────────────────────
    { tier: 11, free: { type: 'coins', value: 1000 },                           premium: { type: 'gems', value: 80 } },
    { tier: 12, free: { type: 'shards', value: 60 },                            premium: { type: 'combat_card_copies', value: 1 } },
    { tier: 13, free: { type: 'coins', value: 1200 },                           premium: { type: 'gems', value: 100 } },
    { tier: 14, free: { type: 'gems', value: 25 },                              premium: { type: 'shards', value: 150 } },
    { tier: 15, free: { type: 'coins', value: 1500 },                           premium: { type: 'talent_charge', value: 1 } },
    { tier: 16, free: { type: 'shards', value: 75 },                            premium: { type: 'gems', value: 120 } },
    { tier: 17, free: { type: 'coins', value: 1800 },                           premium: { type: 'shards', value: 200 } },
    { tier: 18, free: { type: 'gems', value: 30 },                              premium: { type: 'combat_card_copies', value: 2 } },
    { tier: 19, free: { type: 'coins', value: 2000 },                           premium: { type: 'gems', value: 150 } },
    { tier: 20, free: { type: 'gems', value: 50 },                              premium: { type: 'cosmetic', value: 'card_back_silver' } },
    { tier: 21, free: { type: 'coins', value: 2200 },                           premium: { type: 'shards', value: 250 } },
    { tier: 22, free: { type: 'shards', value: 100 },                           premium: { type: 'gems', value: 175 } },
    { tier: 23, free: { type: 'coins', value: 2500 },                           premium: { type: 'talent_charge', value: 2 } },
    { tier: 24, free: { type: 'gems', value: 40 },                              premium: { type: 'gems', value: 200 } },
    { tier: 25, free: { type: 'coins', value: 3000 },                           premium: { type: 'cosmetic', value: 'avatar_frame_bronze' } },

    // ── Late-game T26–T40 ───────────────────────────────────────────────────
    { tier: 26, free: { type: 'shards', value: 125 },                           premium: { type: 'gems', value: 200 } },
    { tier: 27, free: { type: 'coins', value: 3500 },                           premium: { type: 'combat_card_copies', value: 2 } },
    { tier: 28, free: { type: 'gems', value: 60 },                              premium: { type: 'shards', value: 300 } },
    { tier: 29, free: { type: 'coins', value: 4000 },                           premium: { type: 'gems', value: 250 } },
    { tier: 30, free: { type: 'shards', value: 150 },                           premium: { type: 'cosmetic', value: 'card_back_gold' } },
    { tier: 31, free: { type: 'coins', value: 4500 },                           premium: { type: 'talent_charge', value: 2 } },
    { tier: 32, free: { type: 'gems', value: 75 },                              premium: { type: 'gems', value: 300 } },
    { tier: 33, free: { type: 'coins', value: 5000 },                           premium: { type: 'shards', value: 400 } },
    { tier: 34, free: { type: 'shards', value: 200 },                           premium: { type: 'combat_card_copies', value: 3 } },
    { tier: 35, free: { type: 'coins', value: 6000 },                           premium: { type: 'gems', value: 350 } },
    { tier: 36, free: { type: 'gems', value: 100 },                             premium: { type: 'shards', value: 500 } },
    { tier: 37, free: { type: 'coins', value: 7000 },                           premium: { type: 'talent_charge', value: 3 } },
    { tier: 38, free: { type: 'shards', value: 250 },                           premium: { type: 'gems', value: 400 } },
    { tier: 39, free: { type: 'coins', value: 8000 },                           premium: { type: 'cosmetic', value: 'avatar_frame_gold' } },
    { tier: 40, free: { type: 'gems', value: 150 },                             premium: { type: 'cosmetic', value: 'card_back_mythic' } },
  ];

  for (const row of curated) {
    tiers.push({ tier: row.tier, free: row.free, premium: row.premium });
  }

  // T41–T60: generic coins. Free track scales 5,000 → 50,000. VIP track is 2x.
  // Linear ramp across 20 tiers.
  for (let i = 41; i <= TOTAL_BP_TIERS; i++) {
    const idx = i - 41; // 0..19
    // 5,000 + 2,368 per step ≈ 50,000 at idx=19
    const freeCoins = Math.round((5000 + idx * (45000 / 19)) / 100) * 100;
    tiers.push({
      tier: i,
      free: { type: 'coins', value: freeCoins },
      premium: { type: 'coins', value: freeCoins * 2 },
    });
  }

  return tiers;
}

export function bpTierFromXp(xp: number): number {
  const tier = Math.floor(xp / XP_PER_TIER) + 1;
  return Math.min(tier, TOTAL_BP_TIERS);
}

// Legacy shop cost functions — these should be removed when dailyShop is refactored.
// For now, they are stubs to satisfy the import.
export function perkCoinCost(_perkId: string): number {
  return 100;
}

export function perkCost(_perkId: string, _currencyType?: string): number {
  return 100;
}

// Combat clear XP formula: base (50 + stage*2), star multiplier, boss bonus, hardmode bonus.
export function xpFromCombatClear(
  stage: number,
  stars: 1 | 2 | 3,
  isBoss: boolean,
  isHardmode: boolean = false,
): number {
  const base = 50 + stage * 2;
  const starMult: Record<number, number> = { 1: 1.0, 2: 1.3, 3: 1.6 };
  const mult = starMult[stars] ?? 1.0;
  const bossBonus = isBoss ? 200 : 0;
  const hardmodeBonus = isHardmode ? 1.5 : 1.0;
  return Math.floor((base + bossBonus) * mult * hardmodeBonus);
}

// Check if 30 days have elapsed since season start. If so, reset XP/claims and bump season.
export function checkBpSeasonRollover(profile: {
  bpSeasonISO: string | null;
  bpSeasonNumber: number;
  bpXp: number;
  bpClaimedFree: number[];
  bpClaimedPremium: number[];
}): {
  bpSeasonISO: string | null;
  bpSeasonNumber: number;
  bpXp: number;
  bpClaimedFree: number[];
  bpClaimedPremium: number[];
} {
  if (!profile.bpSeasonISO) {
    // No season started yet; initialize today.
    const today = new Date().toISOString().slice(0, 10);
    return {
      ...profile,
      bpSeasonISO: today,
      bpSeasonNumber: 1,
    };
  }

  const startDate = new Date(profile.bpSeasonISO);
  const now = new Date();
  const elapsedDays = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);

  if (elapsedDays >= 30) {
    // Season rolled over; reset XP and claims, start new season.
    const nextSeasonStart = new Date(startDate);
    nextSeasonStart.setDate(nextSeasonStart.getDate() + 30);
    return {
      ...profile,
      bpSeasonISO: nextSeasonStart.toISOString().slice(0, 10),
      bpSeasonNumber: profile.bpSeasonNumber + 1,
      bpXp: 0,
      bpClaimedFree: [],
      bpClaimedPremium: [],
    };
  }

  return profile;
}

// Remaining days in the current season (for UI countdown).
export function daysRemainingInSeason(bpSeasonISO: string | null): number {
  if (!bpSeasonISO) return 30;
  const startDate = new Date(bpSeasonISO);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 30);
  const remaining = (endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(remaining));
}
