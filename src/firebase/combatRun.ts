// Signed cloud session wrappers for Sigilbound combat.
//
// Sessions provide an authenticated audit trail now. Rewards remain local
// until the deterministic combat engine is shared with Cloud Functions and
// the server can replay each action safely.

import { httpsCallable } from 'firebase/functions';
import { getFirebase } from './client';

export interface StartCombatStagePayload {
  stageNumber: number;
  hardmode: boolean;
  talentIds: string[];
  equipmentIds: string[];
  deckCardIds: string[];
}

export interface CloudCombatStage {
  runId: string;
  token: string;
  startedAt: number;
}

export async function cloudStartCombatStage(
  payload: StartCombatStagePayload,
): Promise<CloudCombatStage | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<StartCombatStagePayload, CloudCombatStage>(
      fb.functions,
      'startCombatStage',
    );
    return (await fn(payload)).data;
  } catch (err) {
    console.warn('[cloudStartCombatStage] failed; continuing local:', err);
    return null;
  }
}

export async function cloudSubmitCombatStage(payload: {
  runId: string;
  token: string;
  stageNumber: number;
  outcome: 'cleared' | 'defeated';
  stars: 0 | 1 | 2 | 3;
  currentHp: number;
  maxHp: number;
}): Promise<boolean> {
  const fb = getFirebase();
  if (!fb) return false;
  try {
    const fn = httpsCallable<typeof payload, { accepted: boolean }>(
      fb.functions,
      'submitCombatStage',
    );
    return (await fn(payload)).data.accepted;
  } catch (err) {
    console.warn('[cloudSubmitCombatStage] failed:', err);
    return false;
  }
}
