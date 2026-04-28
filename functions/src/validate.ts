// Phase 3 originated this; Phase 5 tightens it.
// These catch obvious tampering (negative coins, impossible numbers, bot-fast
// completions) but don't prove the run was played fairly. Phase 6 will add full
// action-log replay validation by sharing the engine package.

import type { RunResult } from './types';

const MIN_RUN_DURATION_MS = 90_000;       // <1.5 min play time = bot/script (tightened from 60s).
const MIN_MS_PER_ROUND = 5_000;           // <5s/round on average is implausibly fast.
const MAX_COMBOS_PER_SEASON = 50;         // 12 rounds × ~3 combos each = 36 hard ceiling.

// Per-run coin ceilings derived from perks/upgrades, applied multiplicatively.
// Phase 6 replaces with full replay validation.
const BASE_MAX_COINS = 1500;              // Clean run with no upgrades/perks rarely exceeds this.
const PERK_TYCOON_MULT = 1.10;            // perk.tycoon_touch +10% globally
const PERK_AMPLIFIER_MULT = 1.30;         // perk.abundance_amplifier shifts tiers
const UPGRADE_SALE_MULT_MAX = 1.30;       // Market zone upgrades stack ≤+30%

function maxReasonableCoinsFor(perks: string[], upgrades: string[]): number {
  let cap = BASE_MAX_COINS;
  if (perks.includes('perk.tycoon_touch')) cap *= PERK_TYCOON_MULT;
  if (perks.includes('perk.abundance_amplifier')) cap *= PERK_AMPLIFIER_MULT;
  if (perks.includes('perk.combo_cascade')) cap *= 1.15;
  if (upgrades.some(u => u.startsWith('upg.market.'))) cap *= UPGRADE_SALE_MULT_MAX;
  // Add 50% headroom so we only reject very obvious outliers; Phase 6 tightens.
  return Math.round(cap * 1.5);
}

export interface ValidateResult {
  ok: boolean;
  reason?: string;
}

export function validateRun(args: {
  result: RunResult;
  startedAt: number;
  finishedAt: number;
  totalRounds: number;
  perks: string[];
  upgrades: string[];
}): ValidateResult {
  const { result, startedAt, finishedAt, totalRounds, perks, upgrades } = args;

  if (typeof result.finalCoins !== 'number' || result.finalCoins < 0) {
    return { ok: false, reason: 'invalid_coins' };
  }
  const cap = maxReasonableCoinsFor(perks, upgrades);
  if (result.finalCoins > cap) {
    return { ok: false, reason: `coins_above_cap_${cap}` };
  }
  if (result.rounds > totalRounds) {
    return { ok: false, reason: 'rounds_exceed_total' };
  }
  const elapsed = finishedAt - startedAt;
  if (elapsed < MIN_RUN_DURATION_MS) {
    return { ok: false, reason: 'too_fast' };
  }
  if (elapsed < totalRounds * MIN_MS_PER_ROUND) {
    return { ok: false, reason: 'rounds_too_fast' };
  }
  const combos =
    (result.combosTotal?.onslaught ?? 0) +
    (result.combosTotal?.triadic ?? 0) +
    (result.combosTotal?.relentless ?? 0);
  if (combos > MAX_COMBOS_PER_SEASON) {
    return { ok: false, reason: 'too_many_combos' };
  }
  if (!isValidRating(result.rating)) {
    return { ok: false, reason: 'invalid_rating' };
  }
  return { ok: true };
}

function isValidRating(r: unknown): boolean {
  return typeof r === 'string' && ['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic'].includes(r);
}
