// Phase 5 — wrappers for the Battle Pass + shop callable Cloud Functions.
// Each returns the new ProfileSnapshot on success so the client can adopt it
// atomically (Firestore is the source of truth for currencies).

import { httpsCallable } from 'firebase/functions';
import { getFirebase } from './client';
import type { Profile } from '@storage/index';

interface OkResult { ok: boolean; reason?: string; profile: Profile }

export async function bpClaimReward(tier: number, track: 'free' | 'premium'): Promise<OkResult | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<{ tier: number; track: 'free' | 'premium' }, OkResult>(fb.functions, 'bpClaimReward');
    return (await fn({ tier, track })).data;
  } catch (err) {
    console.warn('[bpClaimReward] failed:', err);
    return null;
  }
}

export async function buyPremiumPass(): Promise<OkResult | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<{ acknowledgeDevPurchase: true }, OkResult>(fb.functions, 'buyPremiumPass');
    return (await fn({ acknowledgeDevPurchase: true })).data;
  } catch (err) {
    console.warn('[buyPremiumPass] failed:', err);
    return null;
  }
}

export async function buyPerk(perkId: string, payWith: 'gems' | 'shards'): Promise<OkResult | null> {
  const fb = getFirebase();
  if (!fb) return null;
  try {
    const fn = httpsCallable<{ perkId: string; payWith: 'gems' | 'shards' }, OkResult>(fb.functions, 'buyPerk');
    return (await fn({ perkId, payWith })).data;
  } catch (err) {
    console.warn('[buyPerk] failed:', err);
    return null;
  }
}
