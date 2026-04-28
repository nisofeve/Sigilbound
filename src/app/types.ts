// Top-level app types — the Screen union the router switches on, and the
// CloudRunHandle that ties a started run to its cloud counterpart for the
// anti-cheat submit flow. Lifted out of App.tsx to keep the shell thin.

import type { BattleRunner, CombatStageDef, EquippedSet, OrderCard, Perk, RunResult } from '@engine/index';
import type { Profile, StageRunOutcome } from '@storage/index';

export interface CloudRunHandle {
  runId: string;
  token: string;
  startedAt: number;
  mode: 'solo' | 'pvp';
  pvpMatchId?: string;
}

export type Screen =
  // Sigilbound primary entry. Replaces the old farming home as the default
  // app screen. The legacy `'home'` kind below routes to the (now-hidden)
  // Plotbound farm hub for emergency fallback.
  | { kind: 'sigilbound_hub' }
  | { kind: 'home' }
  | { kind: 'perks'; stage: number | null }
  | { kind: 'farmstead' }
  | { kind: 'settings' }
  | { kind: 'social' }
  | { kind: 'battlepass' }
  | { kind: 'shop' }
  | { kind: 'deck' }
  | { kind: 'profile' }
  | { kind: 'stage_select' }
  | { kind: 'order_pick'; seed: number; perkIds: string[]; ownedUpgradeIds: string[]; customDeck: string[]; customDeckGrades: string[]; ownedCardIds: string[]; cloud: CloudRunHandle | null }
  | { kind: 'game'; seed: number; perkIds: string[]; ownedUpgradeIds: string[]; customDeck: string[]; customDeckGrades: string[]; ownedCardIds: string[]; chosenOrders: OrderCard[]; stageNumber: number | null; cloud: CloudRunHandle | null }
  | { kind: 'achievements' }
  | { kind: 'results'; result: RunResult; profile: Profile; isNewBest: boolean; questsCompleted: string[]; gemsAwarded: number; achievementsUnlocked: string[]; pvpMatchId?: string; stageOutcome: StageRunOutcome | null }
  // Sigilbound combat flow (Phase 5 — parallel to the farming flow above).
  // Cleanup of the farming branch comes in Phase 6.
  | { kind: 'combat_home' }
  | { kind: 'combat'; stageNumber: number; talents: ReadonlyArray<Perk>; equipment: EquippedSet; hardcore: boolean; carryHp?: number; customDeck?: ReadonlyArray<string> }
  | { kind: 'combat_result'; outcome: 'cleared' | 'defeated'; stage: CombatStageDef; runner: BattleRunner; talents: ReadonlyArray<Perk>; equipment: EquippedSet; hardcore: boolean; customDeck?: ReadonlyArray<string> };
