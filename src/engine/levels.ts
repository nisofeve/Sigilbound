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
// Each level grants ONE reward chest. Every 5th level is a "milestone": a
// bonus pack stacks an extra card bundle, more currency, and (from L10+) a
// talent charge on top of the normal reward.
//
// Sigilbound theme: card rewards are combat actions/tactics (routed to
// `combatCardInventory` by the claim path), perks are non-starter combat
// talents. Lower-tier (common) cards dominate early-game; uncommon unlocks
// in the pool from L10, rare from L25 milestones only — keeps the feeling
// of a real progression instead of dumping legendaries into an L3 chest.
//
// Deterministic per level so reloading doesn't reroll a chest.

export type LevelReward =
  | { type: 'coins'; value: number }
  | { type: 'gems'; value: number }
  | { type: 'shards'; value: number }
  | { type: 'card'; cardId: CardId; count: number }
  | { type: 'perk'; perkId: string; count: number };

// Combat card pools split by tier. Players can pull commons every level;
// uncommons unlock in the rotation at L10; rares only ever drop on L25+
// milestones (and even then weighted toward 1-of-1 picks). Mid-tier cards
// rotate in via `cardPoolForLevel` below.
const COMMON_CARDS: ReadonlyArray<CardId> = [
  // Actions across all 5 damage families so leveled players get variety.
  'act_001', 'act_002', 'act_003', 'act_004',  // physical
  'act_013', 'act_014',                          // fire
  'act_023', 'act_024',                          // ice
  'act_032',                                     // thunder
  'act_040', 'act_041',                          // nature
  'act_049', 'act_050',                          // holy
  'act_057',                                     // dark
  // Common tactics — block/heal/draw staples.
  'tac_001', 'tac_002', 'tac_003', 'tac_004', 'tac_005',
];

const UNCOMMON_CARDS: ReadonlyArray<CardId> = [
  'act_005', 'act_006',                          // physical
  'act_015', 'act_016',                          // fire
  'act_025', 'act_026',                          // ice
  'act_033', 'act_034',                          // thunder
  'act_042', 'act_043',                          // nature
  'act_051',                                     // holy
  'act_058',                                     // dark
  'tac_006', 'tac_008', 'tac_010', 'tac_012',
];

const RARE_CARDS: ReadonlyArray<CardId> = [
  'act_008', 'act_017', 'act_027', 'act_044',
  'tac_009', 'tac_013',
];

// Picks a card id appropriate to the level — common-only pre-10, common +
// uncommon from 10..24, common + uncommon + rare on 25+ milestones. The
// `richer` flag (passed for milestone bonus packs) tilts the roll toward
// the higher-tier pool when available.
function cardPoolForLevel(level: number, richer: boolean): ReadonlyArray<CardId> {
  if (level >= 25 && richer) return RARE_CARDS;
  if (level >= 25)           return UNCOMMON_CARDS;
  if (level >= 10)           return richer ? UNCOMMON_CARDS : COMMON_CARDS;
  return COMMON_CARDS;
}

// Talent pool for level rewards. Starter perks (battlecry/vigorous) are
// excluded — they're already permanently owned. High-rarity talents stay
// shop-exclusive so the level track doesn't trivialise the gem economy.
const REWARD_TALENT_POOL: ReadonlyArray<string> = [
  'talent.quick_draw',
  'talent.steel_specialist',
  'talent.pyre_specialist',
  'talent.tacticians_mark',
  'talent.iron_discipline',
  'talent.bigger_hand',
  'talent.extra_sigil',
  'talent.swift_recovery',
];

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

function pickFrom<T>(pool: ReadonlyArray<T>, rng: () => number): T {
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

// Returns the reward(s) granted at level `level`. Stable for a given level.
//
// Layout:
//   - Every level grants a guaranteed main reward (currency OR a card).
//   - Every 5th level is a milestone: in addition to the main reward, the
//     player gets a "bonus pack" — a card bundle, gems, and (from L10+) a
//     talent charge + soul shards. The bonus pack scales with level so L50
//     feels meaningfully bigger than L5.
export function rewardsForLevel(level: number): LevelReward[] {
  const milestone = level % 5 === 0;
  const seed = level * 0x9e3779b1;
  const rng = deterministicRand(seed);

  // Currency scaling — quadratic on milestones so L50 lands ~2k coins,
  // ~50 gems, ~25 shards in the bonus pack. Non-milestones keep modest.
  const coinMain     = milestone ? 200 + level * 40 : 50 + level * 12;
  const gemBonus     = 15 + Math.floor(level / 2);
  const shardBonus   = 8 + Math.floor(level / 3);

  const out: LevelReward[] = [];

  // 1. Main reward — every level gets exactly one of these.
  //    Bias toward a card on every 3rd level so the player consistently
  //    builds their collection alongside the currency drip.
  const mainRoll = rng();
  const giveCardAsMain = (level % 3 === 0) || mainRoll < 0.30;
  if (giveCardAsMain) {
    const cardId = pickFrom(cardPoolForLevel(level, false), rng);
    const count = milestone ? 2 : 1;
    out.push({ type: 'card', cardId, count });
  } else if (mainRoll < 0.70) {
    out.push({ type: 'coins', value: coinMain });
  } else if (mainRoll < 0.88) {
    out.push({ type: 'gems', value: Math.max(1, Math.floor(level / 4) + 2) });
  } else {
    out.push({ type: 'shards', value: Math.max(1, Math.floor(level / 5) + 1) });
  }

  // 2. Milestone bonus pack — every 5 levels stacks extra rewards on top.
  if (milestone) {
    // Bonus card bundle. Size grows with level: L5 → 2 cards, L25 → 4, L50 → 6.
    const bundleCount = Math.min(6, 2 + Math.floor(level / 10));
    const bundleCardId = pickFrom(cardPoolForLevel(level, true), rng);
    out.push({ type: 'card', cardId: bundleCardId, count: bundleCount });

    // Gem stipend on every milestone.
    out.push({ type: 'gems', value: gemBonus });

    // From L10 the bonus pack also includes shards + a talent charge.
    if (level >= 10) {
      out.push({ type: 'shards', value: shardBonus });
      // L25+ milestones grant 2 talent charges (was 1) so endgame milestones
      // genuinely feel like a haul.
      const talentCount = level >= 25 ? 2 : 1;
      out.push({ type: 'perk', perkId: pickFrom(REWARD_TALENT_POOL, rng), count: talentCount });
    }
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
