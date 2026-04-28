import type { CropType, HarvestResult, Perk, RoundResult } from './types';
import { sumModifier } from './perks';

// Sigilbound Combo 1 — Onslaught (Plotbound: Abundance Bonus).
// 2 same → +10% | 3 → +20% | 4 → +35% | 5 → +50% | 6+ → +70%.
// In Plotbound this is "harvest N of the same crop"; in Sigilbound it's
// "resolve N Actions of the same damage type". Same math either way — the
// caller decides what `sameTypeCount` represents.
const ONSLAUGHT_TABLE: ReadonlyArray<{ count: number; bonus: number }> = [
  { count: 6, bonus: 0.70 },
  { count: 5, bonus: 0.50 },
  { count: 4, bonus: 0.35 },
  { count: 3, bonus: 0.20 },
  { count: 2, bonus: 0.10 },
];

export function onslaughtMultiplier(sameTypeCount: number, tierBump = 0): number {
  // tierBump shifts the lookup: with bump=1, 2-stack uses 3-stack bonus, etc.
  const effective = sameTypeCount + tierBump;
  for (const tier of ONSLAUGHT_TABLE) {
    if (effective >= tier.count) return 1 + tier.bonus;
  }
  return 1;
}

/** @deprecated Renamed to `onslaughtMultiplier` for Sigilbound. */
export const abundanceMultiplier = onslaughtMultiplier;

// Sigilbound Combo 2 — Triadic Strike (Plotbound: Garden Variety).
// 3 distinct types in the same resolve → +10 flat (coins or damage).
// Resets the Relentless streak (because the resolve is mixed).
// thresholdDelta < 0 (Variety Pack / Triadic Pack talent) lowers the threshold.
export function triadicStrikeBonus(distinctTypeCount: number, thresholdDelta = 0): number {
  const threshold = Math.max(2, 3 + thresholdDelta);
  return distinctTypeCount >= threshold ? 10 : 0;
}

/** @deprecated Renamed to `triadicStrikeBonus` for Sigilbound. */
export const gardenVarietyBonus = triadicStrikeBonus;

// Sigilbound Combo 3 — Relentless (Plotbound: Loyal Harvest).
// Resolving only one type per turn builds a streak: +10%/turn, capped +50%.
const RELENTLESS_PER_STACK = 0.10;
const RELENTLESS_BASE_MAX_STACKS = 5;

export function relentlessMultiplier(streakBeforeRound: number, capDelta = 0): number {
  const maxStacks = RELENTLESS_BASE_MAX_STACKS + capDelta;
  return 1 + Math.min(streakBeforeRound, maxStacks) * RELENTLESS_PER_STACK;
}

/** @deprecated Renamed to `relentlessMultiplier` for Sigilbound. */
export const loyalMultiplier = relentlessMultiplier;

export function relentlessStreakAfter(
  streakBefore: number,
  harvestedTypes: CropType[],
  capDelta = 0,
): { streak: number; loyalCrop: CropType | null } {
  if (harvestedTypes.length === 0) {
    return { streak: streakBefore, loyalCrop: null };
  }
  const distinct = new Set(harvestedTypes);
  const maxStacks = RELENTLESS_BASE_MAX_STACKS + capDelta;
  if (distinct.size === 1) {
    const crop = harvestedTypes[0];
    return { streak: Math.min(maxStacks, streakBefore + 1), loyalCrop: crop };
  }
  return { streak: 0, loyalCrop: null };
}

/** @deprecated Renamed to `relentlessStreakAfter` for Sigilbound. */
export const loyalStreakAfter = relentlessStreakAfter;

export interface ResolveContext {
  relentlessStreakBefore: number;
  relentlessCropBefore: CropType | null;
  round: number;
  perks: Perk[];
  // Extra round-scoped multiplier (e.g. Harvest Festival event = 0.25 → +25%).
  roundSaleMultBonus?: number;
}

// Resolve a full round of harvests with all 3 combos applied + perk + event modifiers.
export function resolveHarvests(
  harvested: ReadonlyArray<{ crop: CropType; basePrice: number }>,
  ctx: ResolveContext,
): RoundResult {
  const counts = new Map<CropType, number>();
  for (const h of harvested) counts.set(h.crop, (counts.get(h.crop) ?? 0) + 1);

  const distinctCount = counts.size;
  const harvestedTypes = harvested.map(h => h.crop);
  const allOneType = distinctCount === 1;
  const carriedRelentlessCrop = allOneType && (ctx.relentlessCropBefore === null || ctx.relentlessCropBefore === harvested[0]?.crop);

  const onslaughtBump = sumModifier(ctx.perks, 'onslaught_tier_bump');
  const relentlessCapDelta = sumModifier(ctx.perks, 'relentless_cap_delta');
  const globalSaleMult = sumModifier(ctx.perks, 'global_sale_mult'); // perk-only here; upgrades fold in via ctx.roundSaleMultBonus or seedling baseline
  const triadicThresholdDelta = sumModifier(ctx.perks, 'triadic_threshold_delta');

  const harvests: HarvestResult[] = harvested.map(({ crop, basePrice }) => {
    const same = counts.get(crop) ?? 1;
    const onslaughtMult = onslaughtMultiplier(same, onslaughtBump);
    const relentlessMult = carriedRelentlessCrop ? relentlessMultiplier(ctx.relentlessStreakBefore, relentlessCapDelta) : 1;
    const globalMult = 1 + globalSaleMult + (ctx.roundSaleMultBonus ?? 0);
    const finalPrice = Math.round(basePrice * onslaughtMult * relentlessMult * globalMult);
    return { crop, basePrice, onslaughtMult, relentlessMult, finalPrice };
  });

  const triadicBonus = triadicStrikeBonus(distinctCount, triadicThresholdDelta);
  const totalCoinsThisRound = harvests.reduce((sum, h) => sum + h.finalPrice, 0) + triadicBonus;

  const { streak: relentlessStreakAfterValue } = relentlessStreakAfter(ctx.relentlessStreakBefore, harvestedTypes, relentlessCapDelta);

  return {
    round: ctx.round,
    harvests,
    triadicBonus,
    totalCoinsThisRound,
    relentlessStreakAfter: relentlessStreakAfterValue,
    combosTriggered: {
      onslaught: harvests.some(h => h.onslaughtMult > 1),
      triadic: triadicBonus > 0,
      relentless: harvests.some(h => h.relentlessMult > 1),
    },
  };
}
