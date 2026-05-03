// Daily quests — kept in sync with the cloud function copy in functions/src/index.ts.
// When the player is offline (no cloud), the client applies these locally so quest
// progress feels immediate. The cloud is authoritative when sync runs.

import questsJson from '@data/quests.json';
import type { RunResult } from './types';
import { mulberry32 } from './rng';

export type QuestKind = 'seasons' | 'coins' | 'triple_combo' | 'damage_type' | 'combo_count' | 'defeat_boss' | 'no_damage_turns';

export interface Quest {
  id: string;
  name: string;
  description: string;
  icon: string;
  kind: QuestKind;
  goal: number;
  difficulty: 'easy' | 'medium' | 'hard';
  rewardCoins: number;
  rewardGems: number;
  rewardShards: number;
  param?: string;  // discriminator for damage_type kinds
}

const ALL_QUESTS = questsJson as Quest[];

export function allQuests(): Quest[] {
  return ALL_QUESTS.slice();
}

export function getQuest(id: string): Quest | null {
  return ALL_QUESTS.find(q => q.id === id) ?? null;
}

// Today's UTC date key (matches cloud function's todayKey()).
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuestProgressUpdate {
  state: Record<string, { progress: number; claimed: boolean }>;
  completedNow: string[];
  gemsAwarded: number;
  coinsAwarded?: number;
  shardsAwarded?: number;
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

export function applyQuestProgress(
  current: Record<string, { progress: number; claimed: boolean }>,
  result: RunResult,
): QuestProgressUpdate {
  const state = { ...current };
  const completedNow: string[] = [];
  let gemsAwarded = 0;

  for (const q of ALL_QUESTS) {
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
    }
  }

  return { state, completedNow, gemsAwarded };
}

export function applyCombatQuestProgress(
  current: Record<string, { progress: number; claimed: boolean }>,
  result: CombatRunResult,
): QuestProgressUpdate {
  const state = { ...current };
  const completedNow: string[] = [];
  let coinsAwarded = 0;
  let gemsAwarded = 0;
  let shardsAwarded = 0;

  for (const q of ALL_QUESTS) {
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
    }
  }

  return { state, completedNow, gemsAwarded, coinsAwarded, shardsAwarded };
}

// Seeded daily quest selection. Returns the same 3 quests for all players on the same day.
export function selectDailyQuests(dateKey: string, questPool: Quest[] = ALL_QUESTS, count: number = 3): Quest[] {
  const hashSeed = dateKey.split('-').reduce((acc, part) => acc * 31 + parseInt(part, 10), 0);
  const rng = mulberry32(hashSeed);
  const shuffled = questPool.slice().sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}
