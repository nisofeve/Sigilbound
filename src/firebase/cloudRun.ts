// Wrappers around the startRun/submitRun callable Cloud Functions.
// Always returns null when cloud is unavailable; callers fall back to local-only.

import { httpsCallable } from 'firebase/functions';
import { getFirebase } from './client';
import type { RunResult } from '@engine/index';
import type { Profile } from '@storage/index';

export interface StartRunPayload {
  perks?: string[];
  ownedUpgradeIds?: string[];
  mode?: 'solo' | 'pvp';
  pvpMatchId?: string;
}

export interface CloudStartRun {
  runId: string;
  seed: number;
  token: string;
  startedAt: number;
  totalRounds: number;
}

export interface CloudSubmitRun {
  accepted: boolean;
  rejectionReason?: string;
  rewards: {
    coinsToBank: number;
    xp: number;
    gems: number;
    achievementsUnlocked: string[];   // Newly unlocked this run; reward already added cloud-side.
    questsCompleted: string[];
  };
  profile: Profile;
}

export async function cloudStartRun(payload: StartRunPayload): Promise<CloudStartRun | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<StartRunPayload, CloudStartRun>(fb.functions, 'startRun');
    const res = await fn(payload);
    return res.data;
  } catch (err) {
    console.warn('[cloudStartRun] failed, falling back to local seed:', err);
    return null;
  }
}

export async function cloudSubmitRun(payload: {
  runId: string;
  token: string;
  result: RunResult;
  perksUsed: string[];
  ownedUpgradeIds: string[];
  mode?: 'solo' | 'pvp';
  pvpMatchId?: string;
}): Promise<CloudSubmitRun | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<typeof payload, CloudSubmitRun>(fb.functions, 'submitRun');
    const res = await fn(payload);
    return res.data;
  } catch (err) {
    console.warn('[cloudSubmitRun] failed:', err);
    return null;
  }
}
