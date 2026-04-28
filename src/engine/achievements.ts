// Phase 6 — Achievement evaluator. Pure functions. Mirrored exactly in the
// cloud function (functions/src/index.ts) so client + server agree on which
// achievements unlock; the cloud is authoritative for awarding rewards.

import achievementsJson from '@data/achievements.json';
import type {
  Achievement,
  AchievementCategory,
  AchievementPredicate,
  RunResult,
} from './types';

const ALL_ACHIEVEMENTS = achievementsJson as Achievement[];
const byId = new Map(ALL_ACHIEVEMENTS.map(a => [a.id, a]));

export function allAchievements(): Achievement[] {
  return ALL_ACHIEVEMENTS.slice();
}

export function getAchievement(id: string): Achievement | null {
  return byId.get(id) ?? null;
}

export function achievementsByCategory(): Record<AchievementCategory, Achievement[]> {
  const out = {} as Record<AchievementCategory, Achievement[]>;
  for (const a of ALL_ACHIEVEMENTS) {
    (out[a.category] ??= []).push(a);
  }
  return out;
}

// === Evaluation context ===

export interface AchievementContext {
  // Snapshot of the player's profile AFTER the latest action has been applied.
  profile: {
    seasonsPlayed: number;
    totalCoinsEarned: number;
    bankCoins: number;
    lifetimeCombos: { onslaught: number; triadic: number; relentless: number };
    bestRating: Rating;
    pvpWins: number;
    friends: string[];
    upgradesOwned: string[];
    perksOwned: string[];
    bpXp: number;
    bpPremium: boolean;
    achievementsUnlocked: string[];
  };
  // Optional last-run context for predicates that need per-run signals
  // (single_run_coins, triple_combo_in_run).
  lastRun?: RunResult;
}

// Order of rating tiers: fail < survive < bronze < silver < gold < mythic.
const ACTUAL_RATING_ORDER = ['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic'] as const;
function ratingAtLeast(actual: Rating, min: Rating): boolean {
  return ACTUAL_RATING_ORDER.indexOf(actual) >= ACTUAL_RATING_ORDER.indexOf(min);
}

function bpTierFromXp(xp: number): number {
  return Math.max(1, Math.min(40, Math.floor(xp / 1000) + 1));
}

function predicateMet(p: AchievementPredicate, ctx: AchievementContext): boolean {
  switch (p.type) {
    case 'lifetime_seasons':  return ctx.profile.seasonsPlayed >= p.min;
    case 'lifetime_coins':    return ctx.profile.totalCoinsEarned >= p.min;
    case 'single_run_coins':  return (ctx.lastRun?.finalCoins ?? 0) >= p.min;
    case 'lifetime_combo':    return (ctx.profile.lifetimeCombos[p.combo] ?? 0) >= p.min;
    case 'triple_combo_in_run': {
      const c = ctx.lastRun?.combosTotal;
      return !!c && c.onslaught > 0 && c.triadic > 0 && c.relentless > 0;
    }
    case 'best_rating':        return ratingAtLeast(ctx.profile.bestRating, p.min);
    case 'pvp_wins':           return ctx.profile.pvpWins >= p.min;
    case 'friends_count':      return ctx.profile.friends.length >= p.min;
    case 'upgrades_owned':     return ctx.profile.upgradesOwned.length >= p.min;
    case 'perks_owned':        return ctx.profile.perksOwned.length >= p.min;
    case 'bp_tier':            return bpTierFromXp(ctx.profile.bpXp) >= p.min;
    case 'bp_premium':         return ctx.profile.bpPremium;
    case 'bank_coins_at_least':return ctx.profile.bankCoins >= p.min;
  }
}

// Returns achievements that are NOT yet in profile.achievementsUnlocked but whose
// predicate is now satisfied. Cheap O(N) over all defined achievements.
export function evaluateNewlyUnlocked(ctx: AchievementContext): Achievement[] {
  const out: Achievement[] = [];
  for (const a of ALL_ACHIEVEMENTS) {
    if (ctx.profile.achievementsUnlocked.includes(a.id)) continue;
    if (predicateMet(a.predicate, ctx)) out.push(a);
  }
  return out;
}

// Preview state — used for UI progress bars on the AchievementsScreen.
// Returns "current/goal" pair for predicates that have a measurable progress.
export function predicateProgress(p: AchievementPredicate, ctx: AchievementContext): { current: number; goal: number } | null {
  switch (p.type) {
    case 'lifetime_seasons':   return { current: ctx.profile.seasonsPlayed,            goal: p.min };
    case 'lifetime_coins':     return { current: ctx.profile.totalCoinsEarned,         goal: p.min };
    case 'lifetime_combo':     return { current: ctx.profile.lifetimeCombos[p.combo] ?? 0, goal: p.min };
    case 'pvp_wins':           return { current: ctx.profile.pvpWins,                  goal: p.min };
    case 'friends_count':      return { current: ctx.profile.friends.length,           goal: p.min };
    case 'upgrades_owned':     return { current: ctx.profile.upgradesOwned.length,     goal: p.min };
    case 'perks_owned':        return { current: ctx.profile.perksOwned.length,        goal: p.min };
    case 'bp_tier':            return { current: bpTierFromXp(ctx.profile.bpXp),       goal: p.min };
    case 'bank_coins_at_least':return { current: ctx.profile.bankCoins,                goal: p.min };
    case 'single_run_coins':
    case 'triple_combo_in_run':
    case 'best_rating':
    case 'bp_premium':
      return null; // boolean / per-run: progress bar doesn't apply.
  }
}

// Local-only helper for the importing module.
type Rating = 'fail' | 'survive' | 'bronze' | 'silver' | 'gold' | 'mythic';
