// Player level system. XP comes from completing seasons, unlocking
// achievements, and (later) cloud events. Leveling pays out claimable
// rewards: small ones every level, bigger packages at every 5th level
// (5, 10, 15, …, 50). Cap is L50.

import type { CardId } from './types';

export const MAX_LEVEL = 50;

// XP required to GO from level N to level N+1. Front-loaded curve so the
// first few levels feel fast, with a slow climb to L50.
//
// Level   1→2  2→3  3→4 ...  10→11 ...  25→26 ...  49→50
// XP        50  80   120      280       540        2300
//
// Total XP to L50 ≈ 36k — roughly one well-played season grants 200-600 XP
// (50 from completion + 10-150 from achievements unlocked along the way), so
// L50 sits around 100+ seasons of play.
function xpForNext(level: number): number {
  if (level >= MAX_LEVEL) return Infinity;
  // Smooth quadratic-ish curve.
  const base = 40;
  const growth = 12;
  return Math.round(base + level * growth + (level * level) * 0.6);
}

// Cumulative XP required to REACH a given level (level 1 is reached at 0 XP).
const CUMULATIVE: number[] = (() => {
  const out = [0];
  for (let i = 1; i < MAX_LEVEL; i++) out.push(out[i - 1] + xpForNext(i));
  return out;
})();

export function totalXpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return CUMULATIVE[MAX_LEVEL - 1];
  return CUMULATIVE[level - 1];
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  // Walk the curve. With 50 levels this is trivially cheap.
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (xp >= totalXpForLevel(lvl)) return lvl;
  }
  return 1;
}

// Returns the partial-progress (0..1) toward the next level.
export function levelProgress(xp: number): { level: number; intoLevelXp: number; nextLevelXp: number; pct: number } {
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, intoLevelXp: 0, nextLevelXp: 0, pct: 1 };
  const start = totalXpForLevel(level);
  const next = totalXpForLevel(level + 1);
  const into = xp - start;
  const span = next - start;
  return { level, intoLevelXp: into, nextLevelXp: span, pct: Math.max(0, Math.min(1, into / span)) };
}

// === Reward generator ===
//
// Each level grants ONE reward chest. Every 5th level is "milestone": bigger
// rewards drawn from a richer pool. Determinstic per (level, profile-seed)
// pair so a player's reward at L17 is always the same — no rerolling by
// reloading.

export type LevelReward =
  | { type: 'coins'; value: number }
  | { type: 'gems'; value: number }
  | { type: 'shards'; value: number }
  | { type: 'card'; cardId: CardId; count: number }
  | { type: 'perk'; perkId: string; count: number };

// Stable cards used for level rewards — mostly common starter seeds and a
// handful of tools. Players get most cards through the daily shop; the level
// track is more about coins/gems with occasional card drops.
const REWARD_CARDS: { id: CardId; weight: number }[] = [
  { id: 'seed.humble_carrot', weight: 12 },
  { id: 'seed.golden_corn',   weight: 10 },
  { id: 'seed.lettuce_leaf',  weight: 10 },
  { id: 'tool.watering_can',  weight: 8 },
  { id: 'tool.fertilizer_bag',weight: 6 },
  { id: 'tool.scarecrow',     weight: 4 },
];

// Perks given as level rewards. Pulled from the common/uncommon pool —
// the high-end perks stay shop-exclusive so leveling doesn't trivialise
// the gem economy. Hard-coded by id so this file doesn't depend on the
// data file at import time (perks data is loaded at module init).
const REWARD_PERKS: { id: string; weight: number }[] = [
  { id: 'perk.carrot_specialist', weight: 6 },
  { id: 'perk.watering_pro',      weight: 5 },
  { id: 'perk.early_bird',        weight: 0 }, // skip starter — already permanent
  { id: 'perk.extra_draw',        weight: 0 },
  { id: 'perk.tycoon_touch',      weight: 4 },
  { id: 'perk.bigger_hand',       weight: 4 },
  { id: 'perk.plot_plus',         weight: 3 },
  { id: 'perk.lucky_streak',      weight: 3 },
  { id: 'perk.combo_cascade',     weight: 2 },
];

function pickPerkId(rng: () => number): string {
  const eligible = REWARD_PERKS.filter(p => p.weight > 0);
  const total = eligible.reduce((a, b) => a + b.weight, 0);
  if (total === 0) return REWARD_PERKS[0]?.id ?? 'perk.tycoon_touch';
  let r = rng() * total;
  for (const p of eligible) {
    r -= p.weight;
    if (r <= 0) return p.id;
  }
  return eligible[eligible.length - 1].id;
}

function deterministicRand(seed: number): () => number {
  // Mulberry32 inline so this module doesn't depend on rng.ts wrapping.
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCard(rng: () => number): CardId {
  const total = REWARD_CARDS.reduce((a, b) => a + b.weight, 0);
  let r = rng() * total;
  for (const c of REWARD_CARDS) {
    r -= c.weight;
    if (r <= 0) return c.id;
  }
  return REWARD_CARDS[0].id;
}

// Returns the reward(s) granted at level `level`. Stable for a given level.
// Most levels grant ONE reward; milestone levels (every 5) grant 2-3.
export function rewardsForLevel(level: number): LevelReward[] {
  const milestone = level % 5 === 0;
  const seed = level * 0x9e3779b1;
  const rng = deterministicRand(seed);

  // Coin / gem scaling — quadratic so L50 milestone is genuinely impressive.
  const coinAmt = milestone ? 200 + level * 40 : 50 + level * 12;
  const gemAmt  = milestone ? 25 + Math.floor(level / 2) : Math.max(1, Math.floor(level / 4));
  const shardAmt = milestone ? 10 + Math.floor(level / 3) : Math.max(1, Math.floor(level / 6));

  const out: LevelReward[] = [];
  if (milestone) {
    // Milestone: coins, gems, a card pack, and (from L10+) a perk charge.
    out.push({ type: 'coins', value: coinAmt });
    out.push({ type: 'gems',  value: gemAmt });
    const cardCount = Math.min(6, 2 + Math.floor(level / 10));
    out.push({ type: 'card', cardId: pickCard(rng), count: cardCount });
    if (level >= 10) out.push({ type: 'shards', value: shardAmt });
    if (level >= 10) {
      // Higher milestones grant 2 charges; massive milestones (L25+) grant 3.
      const perkCount = level >= 25 ? 3 : 2;
      out.push({ type: 'perk', perkId: pickPerkId(rng), count: perkCount });
    }
  } else {
    // Normal level: cycle between currencies, occasional card / perk drops.
    const r = rng();
    if (r < 0.5) out.push({ type: 'coins', value: coinAmt });
    else if (r < 0.7) out.push({ type: 'gems', value: gemAmt });
    else if (r < 0.83) out.push({ type: 'shards', value: shardAmt });
    else if (r < 0.93) out.push({ type: 'card', cardId: pickCard(rng), count: 1 });
    else out.push({ type: 'perk', perkId: pickPerkId(rng), count: 1 });
  }
  return out;
}

// XP awarded for various activities — referenced by storage code so the
// constants live in one place.
export const XP_FROM_SEASON_COMPLETE = 50;
export const XP_PER_RUN_COIN = 0.05;          // 1000 coins → 50 XP
export const XP_FROM_ACHIEVEMENT_BY_RARITY: Record<string, number> = {
  common: 25,
  uncommon: 60,
  rare: 150,
  epic: 350,
  legendary: 800,
  mythic: 2000,
};
