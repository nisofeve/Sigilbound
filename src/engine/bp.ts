// Battle Pass system — seasonal XP progression with free and premium tracks.
//
// Seasons last 30 days. Players earn XP from combat clears and can claim tier
// rewards. The system tracks progress per season and auto-resets after 30 days.

// Quest difficulty tiers map to BP XP rewards.
export const QUEST_BP_XP: Record<string, number> = {
  easy: 150,
  medium: 300,
  hard: 500,
};

// Battle pass tier constants.
export const TOTAL_BP_TIERS = 40;
export const XP_PER_TIER = 500;
export const PREMIUM_PASS_GEM_COST = 800;

export type BpRewardType = 'coins' | 'gems' | 'shards' | 'combat_card_copies' | 'talent_charge' | 'cosmetic' | 'perk';

export interface BpRewardItem {
  type: BpRewardType;
  value?: number | string;
}

export interface BpReward {
  tier: number;
  free?: BpRewardItem;
  premium?: BpRewardItem;
}

// Placeholder: will be loaded from data/bp_rewards_combat.json.
export function allBpTiers(): BpReward[] {
  return Array.from({ length: TOTAL_BP_TIERS }, (_, i) => ({
    tier: i + 1,
    free: { type: 'coins', value: 100 },
    premium: { type: 'gems', value: 30 },
  }));
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
