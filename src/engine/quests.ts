// Daily / weekly / monthly quests — kept in sync with the cloud function copy
// in functions/src/index.ts. Each quest is tagged with a `period` so the runtime
// can roll over the appropriate state bucket and award BP XP from the matching
// reward field. When the player is offline (no cloud), the client applies
// progress locally so the UI feels immediate.

import questsJson from '@data/quests.json';
import type { RunResult } from './types';
import { mulberry32 } from './rng';

export type QuestKind =
  | 'seasons'
  | 'coins'
  | 'triple_combo'
  | 'damage_type'
  | 'combo_count'
  | 'defeat_boss'
  | 'no_damage_turns'
  // ── Out-of-combat / casual kinds (fire from action hooks, not RunResult) ──
  | 'buy_shop_item'         // bought N cards/equipment/talents from a shop
  | 'upgrade_card'          // tiered up a combat card N times
  | 'buy_stronghold_upgrade'// purchased N stronghold upgrades
  | 'open_app';             // opened the game today (instant on first hub render)

export type QuestPeriod = 'daily' | 'weekly' | 'monthly';

export interface Quest {
  id: string;
  period: QuestPeriod;
  name: string;
  description: string;
  icon: string;
  kind: QuestKind;
  goal: number;
  difficulty: 'easy' | 'medium' | 'hard';
  rewardCoins: number;
  rewardGems: number;
  rewardShards: number;
  rewardBpXp: number;
  param?: string;  // discriminator for damage_type kinds
}

const ALL_QUESTS = questsJson as Quest[];

export function allQuests(): Quest[] {
  return ALL_QUESTS.slice();
}

export function getQuest(id: string): Quest | null {
  return ALL_QUESTS.find(q => q.id === id) ?? null;
}

export function questsByPeriod(period: QuestPeriod): Quest[] {
  return ALL_QUESTS.filter(q => q.period === period);
}

// Today's UTC date key (matches cloud function's todayKey()).
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ISO week key (e.g. "2026-W18"). Players in the same calendar week share the
// same selection. Uses ISO 8601 week numbering: weeks start Monday.
export function weekKey(d: Date = new Date()): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Sunday=7).
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

// Month key (e.g. "2026-05"). All players in the same month share the selection.
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface QuestProgressUpdate {
  state: Record<string, { progress: number; claimed: boolean }>;
  completedNow: string[];
  gemsAwarded: number;
  coinsAwarded?: number;
  shardsAwarded?: number;
  bpXpAwarded?: number;
}

// Applied locally when the cloud is unreachable; the cloud submitRun will recompute
// authoritatively when the player is online again.
export interface CombatRunResult {
  cleared: boolean;
  isBoss: boolean;
  damageDealtByType: Record<string, number>;
  combosTriggered: number;
  noConsecutiveDamageTurns: number;
  enemyIdsDefeated: string[];
}

// Apply post-run signals (seasons/coins/triple_combo) across a set of selected
// quests. Period is intentionally not filtered here — the caller chooses which
// state bucket to advance.
export function applyQuestProgress(
  current: Record<string, { progress: number; claimed: boolean }>,
  result: RunResult,
  questPool: Quest[] = ALL_QUESTS,
): QuestProgressUpdate {
  const state = { ...current };
  const completedNow: string[] = [];
  let gemsAwarded = 0;
  let coinsAwarded = 0;
  let shardsAwarded = 0;
  let bpXpAwarded = 0;

  for (const q of questPool) {
    const cur = state[q.id] ?? { progress: 0, claimed: false };
    if (cur.claimed) continue;
    let inc = 0;
    switch (q.kind) {
      case 'seasons':
        inc = 1;
        break;
      case 'coins':
        inc = result.finalCoins;
        break;
      case 'triple_combo':
        inc =
          result.combosTotal.onslaught > 0 &&
          result.combosTotal.triadic > 0 &&
          result.combosTotal.relentless > 0
            ? 1
            : 0;
        break;
    }
    const wasComplete = cur.progress >= q.goal;
    const next: { progress: number; claimed: boolean } = {
      progress: cur.progress + inc,
      claimed: cur.claimed,
    };
    state[q.id] = next;
    if (!wasComplete && next.progress >= q.goal) {
      next.claimed = true;
      completedNow.push(q.id);
      gemsAwarded += q.rewardGems;
      coinsAwarded += q.rewardCoins;
      shardsAwarded += q.rewardShards;
      bpXpAwarded += q.rewardBpXp;
    }
  }

  return { state, completedNow, gemsAwarded, coinsAwarded, shardsAwarded, bpXpAwarded };
}

export function applyCombatQuestProgress(
  current: Record<string, { progress: number; claimed: boolean }>,
  result: CombatRunResult,
  questPool: Quest[] = ALL_QUESTS,
): QuestProgressUpdate {
  const state = { ...current };
  const completedNow: string[] = [];
  let coinsAwarded = 0;
  let gemsAwarded = 0;
  let shardsAwarded = 0;
  let bpXpAwarded = 0;

  for (const q of questPool) {
    const cur = state[q.id] ?? { progress: 0, claimed: false };
    if (cur.claimed) continue;
    let inc = 0;
    switch (q.kind) {
      case 'damage_type':
        inc = result.damageDealtByType[q.param!] ?? 0;
        break;
      case 'combo_count':
        inc = result.combosTriggered;
        break;
      case 'defeat_boss':
        inc = result.isBoss && result.cleared ? 1 : 0;
        break;
      case 'no_damage_turns':
        inc = result.noConsecutiveDamageTurns;
        break;
    }
    const wasComplete = cur.progress >= q.goal;
    const next: { progress: number; claimed: boolean } = {
      progress: cur.progress + inc,
      claimed: cur.claimed,
    };
    state[q.id] = next;
    if (!wasComplete && next.progress >= q.goal) {
      next.claimed = true;
      completedNow.push(q.id);
      coinsAwarded += q.rewardCoins;
      gemsAwarded += q.rewardGems;
      shardsAwarded += q.rewardShards;
      bpXpAwarded += q.rewardBpXp;
    }
  }

  return { state, completedNow, gemsAwarded, coinsAwarded, shardsAwarded, bpXpAwarded };
}

// Apply progress for an out-of-combat player action — buying from a shop,
// upgrading a card, purchasing a stronghold upgrade, opening the app for
// the day. Each call increments `inc` for matching quests across all
// active periods (the caller decides which state buckets to update).
export type QuestAction =
  | { kind: 'buy_shop_item'; count?: number }
  | { kind: 'upgrade_card'; count?: number }
  | { kind: 'buy_stronghold_upgrade'; count?: number }
  | { kind: 'open_app' };

export function applyActionQuestProgress(
  current: Record<string, { progress: number; claimed: boolean }>,
  action: QuestAction,
  questPool: Quest[] = ALL_QUESTS,
): QuestProgressUpdate {
  const state = { ...current };
  const completedNow: string[] = [];
  let coinsAwarded = 0;
  let gemsAwarded = 0;
  let shardsAwarded = 0;
  let bpXpAwarded = 0;

  for (const q of questPool) {
    const cur = state[q.id] ?? { progress: 0, claimed: false };
    if (cur.claimed) continue;
    let inc = 0;
    if (q.kind === action.kind) {
      // open_app is binary; the others can carry a count.
      inc = action.kind === 'open_app' ? 1 : (action.count ?? 1);
    }
    if (inc <= 0) continue;
    const wasComplete = cur.progress >= q.goal;
    const next: { progress: number; claimed: boolean } = {
      progress: cur.progress + inc,
      claimed: cur.claimed,
    };
    state[q.id] = next;
    if (!wasComplete && next.progress >= q.goal) {
      next.claimed = true;
      completedNow.push(q.id);
      gemsAwarded += q.rewardGems;
      coinsAwarded += q.rewardCoins;
      shardsAwarded += q.rewardShards;
      bpXpAwarded += q.rewardBpXp;
    }
  }

  return { state, completedNow, gemsAwarded, coinsAwarded, shardsAwarded, bpXpAwarded };
}

// Seeded periodic quest selection. Returns a stable subset for all players in
// the same period.
//   - daily   → 9 quests (tripled from 3 for higher completion frequency)
//   - weekly  → 12 quests (tripled from 4)
//   - monthly → 9 quests (tripled from 3)
// More active quests means players bump into more frequent "claim" moments
// throughout a session — the dopamine of small completions adds up.
export function selectPeriodicQuests(
  period: QuestPeriod,
  periodKey: string,
  questPool: Quest[] = ALL_QUESTS,
): Quest[] {
  const filtered = questPool.filter(q => q.period === period);
  const count = period === 'weekly' ? 12 : 9;
  const hashSeed = periodKey
    .split(/[-W]/)
    .filter(Boolean)
    .reduce((acc, part) => acc * 31 + parseInt(part, 10), 0);
  const rng = mulberry32(hashSeed);
  const shuffled = filtered.slice().sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

// Backwards-compat helper for the existing daily-only call sites.
export function selectDailyQuests(dateKey: string, questPool: Quest[] = ALL_QUESTS, count: number = 3): Quest[] {
  return selectPeriodicQuests('daily', dateKey, questPool).slice(0, count);
}
