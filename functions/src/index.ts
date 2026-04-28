// Plotbound Cloud Functions — Phase 4 (social + PvP) on top of Phase 3 (cloud + accounts).
//
// Solo:
//   startRun  — auth-gated, mints a server seed, signs a token, persists pending run
//   submitRun — auth-gated, verifies token + reasonableness, awards rewards atomically
// Social:
//   addFriend / removeFriend — mutual friendship with farm-code lookup
// PvP:
//   createPvpChallenge — spawns a match doc with a shared seed
//   startRun(mode='pvp', pvpMatchId) — same flow but uses the match's shared seed
//   submitRun(mode='pvp', pvpMatchId) — records this player's result, computes outcome
//                                       and HR delta when both have submitted
// Misc:
//   ping — health check used by client during dev

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Transaction } from 'firebase-admin/firestore';
import {
  newRunId,
  newSeed,
  signRunToken,
  verifyRunToken,
} from './sign';
import { validateRun } from './validate';
import bpRewardsJson from './bp_rewards.json';
import perksJson from './perks.json';
import achievementsJson from './achievements.json';
import type {
  AddFriendRequest,
  AddFriendResponse,
  BpClaimRewardRequest,
  BpClaimRewardResponse,
  BuyPerkRequest,
  BuyPerkResponse,
  BuyPremiumPassRequest,
  BuyPremiumPassResponse,
  CreatePvpChallengeRequest,
  CreatePvpChallengeResponse,
  ProfileSnapshot,
  PvpMatchSnapshot,
  Rating,
  RemoveFriendRequest,
  RemoveFriendResponse,
  StartRunRequest,
  StartRunResponse,
  SubmitRunRequest,
  SubmitRunResponse,
} from './types';

interface BpRewardEntry {
  type: 'coins' | 'gems' | 'shards' | 'perk';
  value: number | string;
}
interface BpTierEntry {
  tier: number;
  free: BpRewardEntry | null;
  premium: BpRewardEntry | null;
}
const BP_TIERS = bpRewardsJson as BpTierEntry[];
const TOTAL_BP_TIERS = 40;
const XP_PER_TIER = 1000;
const PREMIUM_PASS_GEM_COST = 300;

interface PerkEntry { id: string; rarity: 'common'|'uncommon'|'rare'|'epic'|'legendary'|'mythic'; }
const ALL_PERKS = perksJson as PerkEntry[];
const PERK_GEM_COST: Record<string, number> = { common: 50, uncommon: 100, rare: 300, epic: 800, legendary: 5000, mythic: 8000 };
const PERK_SHARD_COST: Record<string, number> = { common: 50, uncommon: 100, rare: 250, epic: 500, legendary: 1000, mythic: 2000 };

function bpTierFromXp(xp: number): number {
  return Math.max(1, Math.min(TOTAL_BP_TIERS, Math.floor(xp / XP_PER_TIER) + 1));
}
function xpFromRunResult(finalCoins: number): number {
  return Math.round(100 + finalCoins / 4);
}

// === Phase 6 — Achievements (mirror of src/engine/achievements.ts) ===

interface AchievementEntry {
  id: string;
  category: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
  name: string;
  description: string;
  icon: string;
  predicate: { type: string; [k: string]: unknown };
}
const ALL_ACHIEVEMENTS = achievementsJson as AchievementEntry[];

const ACHIEVEMENT_REWARDS: Record<string, { coins: number; gems: number }> = {
  common:    { coins: 10,  gems: 1 },
  uncommon:  { coins: 25,  gems: 3 },
  rare:      { coins: 50,  gems: 8 },
  epic:      { coins: 100, gems: 15 },
  legendary: { coins: 250, gems: 30 },
  mythic:    { coins: 500, gems: 75 },
};

const RATING_ORDER = ['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic'];

function ratingAtLeast(actual: string, min: string): boolean {
  return RATING_ORDER.indexOf(actual) >= RATING_ORDER.indexOf(min);
}

function evalPredicate(p: { type: string; [k: string]: unknown }, profile: ProfileSnapshot, lastRun: { finalCoins: number; combosTotal: { onslaught: number; triadic: number; relentless: number } }): boolean {
  switch (p.type) {
    case 'lifetime_seasons':  return profile.seasonsPlayed >= (p.min as number);
    case 'lifetime_coins':    return profile.totalCoinsEarned >= (p.min as number);
    case 'single_run_coins':  return lastRun.finalCoins >= (p.min as number);
    case 'lifetime_combo':    return (profile.lifetimeCombos as Record<string, number>)[p.combo as string] >= (p.min as number);
    case 'triple_combo_in_run': {
      const c = lastRun.combosTotal;
      return c.onslaught > 0 && c.triadic > 0 && c.relentless > 0;
    }
    case 'best_rating':        return ratingAtLeast(profile.bestRating, p.min as string);
    case 'pvp_wins':           return profile.pvpWins >= (p.min as number);
    case 'friends_count':      return (profile.friends ?? []).length >= (p.min as number);
    case 'upgrades_owned':     return (profile.upgradesOwned ?? []).length >= (p.min as number);
    case 'perks_owned':        return (profile.perksOwned ?? []).length >= (p.min as number);
    case 'bp_tier':            return bpTierFromXp(profile.bpXp ?? 0) >= (p.min as number);
    case 'bp_premium':         return profile.bpPremium === true;
    case 'bank_coins_at_least':return profile.bankCoins >= (p.min as number);
  }
  return false;
}

interface AchievementAward {
  id: string;
  rarity: string;
  name: string;
  icon: string;
  coins: number;
  gems: number;
}

function evaluateAchievements(profile: ProfileSnapshot, lastRun: { finalCoins: number; combosTotal: { onslaught: number; triadic: number; relentless: number } }): AchievementAward[] {
  const owned = new Set(profile.achievementsUnlocked ?? []);
  const out: AchievementAward[] = [];
  for (const a of ALL_ACHIEVEMENTS) {
    if (owned.has(a.id)) continue;
    if (evalPredicate(a.predicate, profile, lastRun)) {
      const reward = ACHIEVEMENT_REWARDS[a.rarity];
      out.push({ id: a.id, rarity: a.rarity, name: a.name, icon: a.icon, coins: reward.coins, gems: reward.gems });
    }
  }
  return out;
}

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 50 });

const TOTAL_ROUNDS = 12;
const HR_START = 1000;
const HR_DELTA = 25;       // ±25 per match (Phase 5 will use Elo-style scaling)
const PVP_TTL_MS = 24 * 60 * 60 * 1000;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyProfile(): ProfileSnapshot {
  return {
    totalCoinsEarned: 0,
    seasonsPlayed: 0,
    bestScore: 0,
    bestRating: 'fail',
    lifetimeCombos: { onslaught: 0, triadic: 0, relentless: 0 },
    lastPlayedISO: null,
    bankCoins: 0,
    upgradesOwned: [],
    perksOwned: ['perk.early_bird', 'perk.extra_draw'],
    perksEquipped: [],
    gems: 0,
    todayQuestsISO: null,
    todayQuestsState: {},
    farmCode: null,
    displayName: null,
    hr: HR_START,
    pvpWins: 0,
    pvpLosses: 0,
    pvpDraws: 0,
    friends: [],
    bpXp: 0,
    bpPremium: false,
    bpClaimedFree: [],
    bpClaimedPremium: [],
    perkShards: 0,
    rejectedRunCount: 0,
    achievementsUnlocked: [],
  };
}

function ratingRank(r: Rating): number {
  return ['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic'].indexOf(r);
}

// ============================================================================
// Farm code helpers
// ============================================================================

// Generate a 6-character farm code formatted like "B49-721" (3 chars - 3 chars).
// Avoids ambiguous chars (0/O, 1/I/L) for hand-typing reliability.
const FARM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newFarmCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += FARM_CODE_ALPHABET[Math.floor(Math.random() * FARM_CODE_ALPHABET.length)];
  }
  return `${s.slice(0, 3)}-${s.slice(3, 6)}`;
}

function normalizeFarmCode(input: string): string {
  // Accept "B49-721" or "B49721" or "b49 721"; output canonical "B49-721"
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length !== 6) return '';
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}`;
}

// Allocate a unique farm code for the user atomically. Side-effect: writes
// to /farmCodes/{code} as a uid mapping for fast lookup.
async function assignFarmCode(tx: Transaction, uid: string): Promise<string> {
  const db = getFirestore();
  // Try up to 5 times — collision odds at 31^6 = ~887M are negligible but be safe.
  for (let i = 0; i < 5; i++) {
    const code = newFarmCode();
    const ref = db.collection('farmCodes').doc(code);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      tx.set(ref, { uid, createdAt: FieldValue.serverTimestamp() });
      return code;
    }
  }
  throw new HttpsError('internal', 'Could not allocate a unique farm code');
}

async function readOrCreateProfile(uid: string): Promise<ProfileSnapshot> {
  const db = getFirestore();
  return await db.runTransaction(async (tx) => {
    const ref = db.collection('profiles').doc(uid);
    const snap = await tx.get(ref);
    if (snap.exists) {
      const profile = snap.data() as ProfileSnapshot;
      // Backfill farmCode if older profile schema is missing it.
      if (!profile.farmCode) {
        const code = await assignFarmCode(tx, uid);
        profile.farmCode = code;
        profile.displayName = profile.displayName ?? `Farmer-${code.split('-')[0]}`;
        tx.set(ref, profile, { merge: true });
      }
      return profile;
    }
    const fresh = emptyProfile();
    fresh.farmCode = await assignFarmCode(tx, uid);
    fresh.displayName = `Farmer-${fresh.farmCode.split('-')[0]}`;
    tx.set(ref, fresh);
    return fresh;
  });
}

// ============================================================================
// startRun
// ============================================================================

export const startRun = onCall<StartRunRequest, Promise<StartRunResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');

    const mode = request.data.mode ?? 'solo';
    const startedAt = Date.now();
    let seed: number;
    let runId: string;

    if (mode === 'pvp') {
      const matchId = request.data.pvpMatchId;
      if (!matchId) throw new HttpsError('invalid-argument', 'pvpMatchId required for PvP mode');
      const matchRef = getFirestore().collection('pvpMatches').doc(matchId);
      const matchSnap = await matchRef.get();
      if (!matchSnap.exists) throw new HttpsError('not-found', 'Unknown PvP match');
      const match = matchSnap.data() as PvpMatchSnapshot;
      if (!match.players.includes(uid)) {
        throw new HttpsError('permission-denied', 'Not a participant in this match');
      }
      if (match.results[uid]) {
        throw new HttpsError('failed-precondition', 'You have already played this match');
      }
      if (match.status === 'resolved') {
        throw new HttpsError('failed-precondition', 'Match already resolved');
      }
      seed = match.sharedSeed;
      runId = `pvp_${matchId}_${uid}`;
    } else {
      seed = newSeed();
      runId = newRunId();
    }

    await getFirestore()
      .collection('runs')
      .doc(runId)
      .set({
        uid,
        seed,
        startedAt,
        status: 'pending',
        mode,
        pvpMatchId: request.data.pvpMatchId ?? null,
        perks: request.data.perks ?? [],
        ownedUpgradeIds: request.data.ownedUpgradeIds ?? [],
      }, { merge: true });

    // Ensure the player has a farm code by the time they're playing.
    await readOrCreateProfile(uid);

    return {
      runId,
      seed,
      token: signRunToken(runId, seed, uid),
      startedAt,
      totalRounds: TOTAL_ROUNDS,
    };
  },
);

// ============================================================================
// submitRun
// ============================================================================

export const submitRun = onCall<SubmitRunRequest, Promise<SubmitRunResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const { runId, token, result, perksUsed, ownedUpgradeIds, mode, pvpMatchId } = request.data;

    const db = getFirestore();
    const runRef = db.collection('runs').doc(runId);
    const runSnap = await runRef.get();
    if (!runSnap.exists) throw new HttpsError('not-found', 'Unknown runId');
    const run = runSnap.data()!;
    if (run.uid !== uid) throw new HttpsError('permission-denied', 'Run belongs to a different user');
    if (run.status !== 'pending') throw new HttpsError('failed-precondition', 'Run already submitted');
    if (!verifyRunToken(runId, run.seed, uid, token)) {
      throw new HttpsError('permission-denied', 'Invalid run token');
    }

    const finishedAt = Date.now();
    const validation = validateRun({
      result,
      startedAt: run.startedAt,
      finishedAt,
      totalRounds: TOTAL_ROUNDS,
      perks: perksUsed ?? [],
      upgrades: ownedUpgradeIds ?? [],
    });

    if (!validation.ok) {
      await runRef.update({ status: 'rejected', rejectionReason: validation.reason, finishedAt });
      // Bump rejected counter so we have a paper trail per profile.
      await getFirestore().collection('profiles').doc(uid).set(
        { rejectedRunCount: FieldValue.increment(1) },
        { merge: true },
      );
      const profile = await readOrCreateProfile(uid);
      return {
        accepted: false,
        rejectionReason: validation.reason,
        rewards: { coinsToBank: 0, xp: 0, gems: 0, achievementsUnlocked: [], questsCompleted: [] },
        profile,
      };
    }

    const profileRef = db.collection('profiles').doc(uid);
    const updated = await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      const current: ProfileSnapshot = snap.exists ? (snap.data() as ProfileSnapshot) : emptyProfile();

      // Backfill farmCode for any pre-Phase-4 profile.
      if (!current.farmCode) {
        current.farmCode = await assignFarmCode(tx, uid);
        current.displayName = current.displayName ?? `Farmer-${current.farmCode.split('-')[0]}`;
      }

      const today = todayKey();
      if (current.todayQuestsISO !== today) {
        current.todayQuestsISO = today;
        current.todayQuestsState = {};
      }

      const questUpdate = applyQuestProgress(current.todayQuestsState, result);

      // Phase 5: BP XP + perk shards. Shards trickle in slowly (1-3 per run).
      const xpEarned = xpFromRunResult(result.finalCoins);
      const shardsEarned = 1 + Math.floor(result.finalCoins / 250);

      // Phase 6: pre-evaluate achievements against the FUTURE profile so
      // unlocked-on-this-run thresholds are awarded immediately. We build
      // a tentative `next` first, then evaluate, then bake in the awards.

      const next: ProfileSnapshot = {
        ...current,
        totalCoinsEarned: current.totalCoinsEarned + result.finalCoins,
        seasonsPlayed: current.seasonsPlayed + 1,
        bestScore: Math.max(current.bestScore, result.finalCoins),
        bestRating:
          ratingRank(result.rating) > ratingRank(current.bestRating)
            ? result.rating : current.bestRating,
        lifetimeCombos: {
          onslaught: current.lifetimeCombos.onslaught + (result.combosTotal?.onslaught ?? 0),
          triadic: current.lifetimeCombos.triadic + (result.combosTotal?.triadic ?? 0),
          relentless: current.lifetimeCombos.relentless + (result.combosTotal?.relentless ?? 0),
        },
        lastPlayedISO: new Date(finishedAt).toISOString(),
        bankCoins: current.bankCoins + result.finalCoins,
        upgradesOwned: dedupe([...current.upgradesOwned, ...ownedUpgradeIds]),
        perksOwned: current.perksOwned,
        perksEquipped: perksUsed,
        gems: current.gems + questUpdate.gemsAwarded,
        bpXp: (current.bpXp ?? 0) + xpEarned,
        perkShards: (current.perkShards ?? 0) + shardsEarned,
      };

      // Evaluate achievements against the would-be next profile + this run.
      const newAchievements = evaluateAchievements(next, result);
      for (const a of newAchievements) {
        next.bankCoins += a.coins;
        next.gems += a.gems;
        next.achievementsUnlocked = [...(next.achievementsUnlocked ?? []), a.id];
      }

      tx.set(profileRef, next, { merge: true });

      tx.update(runRef, { status: 'accepted', finishedAt, result, perksUsed });

      // PvP: record this player's result on the match doc; resolve if both submitted.
      let resolvedPvp: { winnerUid: string | null; isDraw: boolean; hrDelta: { [uid: string]: number } } | null = null;
      if (mode === 'pvp' && pvpMatchId) {
        const matchRef = db.collection('pvpMatches').doc(pvpMatchId);
        const matchSnap = await tx.get(matchRef);
        if (matchSnap.exists) {
          const match = matchSnap.data() as PvpMatchSnapshot;
          match.results[uid] = { finalCoins: result.finalCoins, finishedAtISO: new Date(finishedAt).toISOString() };
          const otherUid = match.players.find(p => p !== uid)!;
          const otherResult = match.results[otherUid];

          if (otherResult) {
            // Both players have submitted — resolve.
            const myCoins = result.finalCoins;
            const otherCoins = otherResult.finalCoins;
            let winner: string | null = null;
            let isDraw = false;
            if (myCoins > otherCoins) winner = uid;
            else if (myCoins < otherCoins) winner = otherUid;
            else isDraw = true;

            const delta: { [uid: string]: number } = {};
            if (isDraw) {
              delta[uid] = 0;
              delta[otherUid] = 0;
            } else if (winner === uid) {
              delta[uid] = HR_DELTA;
              delta[otherUid] = -HR_DELTA;
            } else {
              delta[uid] = -HR_DELTA;
              delta[otherUid] = HR_DELTA;
            }

            match.status = 'resolved';
            match.winnerUid = winner;
            match.isDraw = isDraw;
            match.hrDelta = delta;
            match.resolvedAtISO = new Date(finishedAt).toISOString();

            // Update this player's HR + win/loss inline (we have the profile transaction).
            next.hr = Math.max(0, next.hr + delta[uid]);
            if (isDraw) next.pvpDraws = next.pvpDraws + 1;
            else if (winner === uid) next.pvpWins = next.pvpWins + 1;
            else next.pvpLosses = next.pvpLosses + 1;

            // Update OTHER player's HR + record by writing to their profile doc.
            const otherProfileRef = db.collection('profiles').doc(otherUid);
            const otherSnap = await tx.get(otherProfileRef);
            if (otherSnap.exists) {
              const other = otherSnap.data() as ProfileSnapshot;
              other.hr = Math.max(0, (other.hr ?? HR_START) + delta[otherUid]);
              if (isDraw) other.pvpDraws = (other.pvpDraws ?? 0) + 1;
              else if (winner === otherUid) other.pvpWins = (other.pvpWins ?? 0) + 1;
              else other.pvpLosses = (other.pvpLosses ?? 0) + 1;
              tx.set(otherProfileRef, other, { merge: true });
            }

            resolvedPvp = { winnerUid: winner, isDraw, hrDelta: delta };
          } else {
            match.status = 'one_played';
          }

          tx.set(matchRef, match, { merge: true });
          tx.set(profileRef, next, { merge: true }); // re-write with PvP HR change
        }
      }

      return { profile: next, questsCompleted: questUpdate.completedNow, gemsAwarded: questUpdate.gemsAwarded, resolvedPvp, newAchievements };
    });

    return {
      accepted: true,
      rewards: {
        coinsToBank: result.finalCoins,
        xp: xpFromRunResult(result.finalCoins),
        gems: updated.gemsAwarded,
        achievementsUnlocked: updated.newAchievements.map((a) => a.id),
        questsCompleted: updated.questsCompleted,
      },
      profile: updated.profile,
    };
  },
);

// ============================================================================
// Phase 5 — Battle Pass + shop
// ============================================================================

export const bpClaimReward = onCall<BpClaimRewardRequest, Promise<BpClaimRewardResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const { tier, track } = request.data;
    if (typeof tier !== 'number' || tier < 1 || tier > TOTAL_BP_TIERS) {
      throw new HttpsError('invalid-argument', 'Invalid tier');
    }
    if (track !== 'free' && track !== 'premium') {
      throw new HttpsError('invalid-argument', 'Invalid track');
    }

    const tierEntry = BP_TIERS.find(t => t.tier === tier);
    if (!tierEntry) throw new HttpsError('not-found', 'Tier missing');
    const reward = track === 'free' ? tierEntry.free : tierEntry.premium;
    if (!reward) {
      throw new HttpsError('failed-precondition', 'No reward at this tier on this track');
    }

    const db = getFirestore();
    const profileRef = db.collection('profiles').doc(uid);
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      const profile: ProfileSnapshot = snap.exists ? (snap.data() as ProfileSnapshot) : emptyProfile();
      const currentTier = bpTierFromXp(profile.bpXp ?? 0);
      if (tier > currentTier) {
        return { profile, error: `Reach BP tier ${tier} first (you're at ${currentTier})` };
      }
      const claimedList = track === 'free' ? (profile.bpClaimedFree ?? []) : (profile.bpClaimedPremium ?? []);
      if (claimedList.includes(tier)) {
        return { profile, error: 'Reward already claimed' };
      }
      if (track === 'premium' && !profile.bpPremium) {
        return { profile, error: 'Premium pass not owned' };
      }

      const updated: ProfileSnapshot = { ...profile };
      // Apply reward.
      switch (reward.type) {
        case 'coins':  updated.bankCoins   = (updated.bankCoins ?? 0) + (reward.value as number); break;
        case 'gems':   updated.gems        = (updated.gems ?? 0) + (reward.value as number); break;
        case 'shards': updated.perkShards  = (updated.perkShards ?? 0) + (reward.value as number); break;
        case 'perk': {
          const perkId = reward.value as string;
          if (!updated.perksOwned.includes(perkId)) updated.perksOwned = [...updated.perksOwned, perkId];
          break;
        }
      }
      if (track === 'free') updated.bpClaimedFree = [...claimedList, tier];
      else updated.bpClaimedPremium = [...claimedList, tier];

      tx.set(profileRef, updated, { merge: true });
      return { profile: updated, error: null };
    });

    if (next.error) return { ok: false, reason: next.error, profile: next.profile };
    return { ok: true, profile: next.profile };
  },
);

export const buyPremiumPass = onCall<BuyPremiumPassRequest, Promise<BuyPremiumPassResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    if (!request.data.acknowledgeDevPurchase) {
      throw new HttpsError('failed-precondition', 'acknowledgeDevPurchase required');
    }

    const db = getFirestore();
    const profileRef = db.collection('profiles').doc(uid);
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      const profile: ProfileSnapshot = snap.exists ? (snap.data() as ProfileSnapshot) : emptyProfile();
      if (profile.bpPremium) return { profile, error: 'Already own premium' };
      if ((profile.gems ?? 0) < PREMIUM_PASS_GEM_COST) {
        return { profile, error: `Need ${PREMIUM_PASS_GEM_COST} gems` };
      }
      const updated: ProfileSnapshot = {
        ...profile,
        gems: profile.gems - PREMIUM_PASS_GEM_COST,
        bpPremium: true,
      };
      tx.set(profileRef, updated, { merge: true });
      return { profile: updated, error: null };
    });

    if (next.error) return { ok: false, reason: next.error, profile: next.profile };
    return { ok: true, profile: next.profile };
  },
);

export const buyPerk = onCall<BuyPerkRequest, Promise<BuyPerkResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const { perkId, payWith } = request.data;
    if (payWith !== 'gems' && payWith !== 'shards') {
      throw new HttpsError('invalid-argument', 'payWith must be gems or shards');
    }
    const perk = ALL_PERKS.find(p => p.id === perkId);
    if (!perk) throw new HttpsError('not-found', 'Unknown perk');
    const cost = (payWith === 'gems' ? PERK_GEM_COST : PERK_SHARD_COST)[perk.rarity];

    const db = getFirestore();
    const profileRef = db.collection('profiles').doc(uid);
    const next = await db.runTransaction(async (tx) => {
      const snap = await tx.get(profileRef);
      const profile: ProfileSnapshot = snap.exists ? (snap.data() as ProfileSnapshot) : emptyProfile();
      if (profile.perksOwned.includes(perkId)) return { profile, error: 'Already owned' };
      const purse = payWith === 'gems' ? (profile.gems ?? 0) : (profile.perkShards ?? 0);
      if (purse < cost) return { profile, error: `Need ${cost} ${payWith}` };
      const updated: ProfileSnapshot = {
        ...profile,
        perksOwned: [...profile.perksOwned, perkId],
        gems: payWith === 'gems' ? profile.gems - cost : profile.gems,
        perkShards: payWith === 'shards' ? profile.perkShards - cost : profile.perkShards,
      };
      tx.set(profileRef, updated, { merge: true });
      return { profile: updated, error: null };
    });

    if (next.error) return { ok: false, reason: next.error, profile: next.profile };
    return { ok: true, profile: next.profile };
  },
);

// ============================================================================
// Friends
// ============================================================================

export const addFriend = onCall<AddFriendRequest, Promise<AddFriendResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const code = normalizeFarmCode(request.data.farmCode ?? '');
    if (!code) return { ok: false, reason: 'Farm code must be 6 letters/numbers' };

    const db = getFirestore();
    const codeSnap = await db.collection('farmCodes').doc(code).get();
    if (!codeSnap.exists) return { ok: false, reason: 'No farmer with that code' };
    const friendUid = (codeSnap.data() as { uid: string }).uid;
    if (friendUid === uid) return { ok: false, reason: "That's your own farm code" };

    return await db.runTransaction(async (tx) => {
      const meRef = db.collection('profiles').doc(uid);
      const friendRef = db.collection('profiles').doc(friendUid);
      const [meSnap, friendSnap] = await Promise.all([tx.get(meRef), tx.get(friendRef)]);
      if (!meSnap.exists || !friendSnap.exists) {
        return { ok: false, reason: 'Profile missing' };
      }
      const me = meSnap.data() as ProfileSnapshot;
      const friend = friendSnap.data() as ProfileSnapshot;
      const meFriends = new Set(me.friends ?? []);
      const friendFriends = new Set(friend.friends ?? []);
      meFriends.add(friendUid);
      friendFriends.add(uid);
      tx.set(meRef, { friends: [...meFriends] }, { merge: true });
      tx.set(friendRef, { friends: [...friendFriends] }, { merge: true });
      return { ok: true, friendUid, friendDisplayName: friend.displayName ?? friend.farmCode ?? undefined };
    });
  },
);

export const removeFriend = onCall<RemoveFriendRequest, Promise<RemoveFriendResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const friendUid = request.data.friendUid;
    if (!friendUid) return { ok: false };

    const db = getFirestore();
    return await db.runTransaction(async (tx) => {
      const meRef = db.collection('profiles').doc(uid);
      const friendRef = db.collection('profiles').doc(friendUid);
      const [meSnap, friendSnap] = await Promise.all([tx.get(meRef), tx.get(friendRef)]);
      if (meSnap.exists) {
        const me = meSnap.data() as ProfileSnapshot;
        tx.set(meRef, { friends: (me.friends ?? []).filter(f => f !== friendUid) }, { merge: true });
      }
      if (friendSnap.exists) {
        const friend = friendSnap.data() as ProfileSnapshot;
        tx.set(friendRef, { friends: (friend.friends ?? []).filter(f => f !== uid) }, { merge: true });
      }
      return { ok: true };
    });
  },
);

// ============================================================================
// PvP
// ============================================================================

function pvpMatchId(a: string, b: string, seed: number): string {
  const [first, second] = [a, b].sort();
  return `pvp_${first}_${second}_${seed.toString(36)}`;
}

export const createPvpChallenge = onCall<CreatePvpChallengeRequest, Promise<CreatePvpChallengeResponse>>(
  { enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required');
    const opponentUid = request.data.opponentUid;
    if (!opponentUid) return { ok: false, reason: 'opponentUid required' };
    if (opponentUid === uid) return { ok: false, reason: "Can't challenge yourself" };

    const db = getFirestore();
    const meRef = db.collection('profiles').doc(uid);
    const oppRef = db.collection('profiles').doc(opponentUid);
    const [meSnap, oppSnap] = await Promise.all([meRef.get(), oppRef.get()]);
    if (!meSnap.exists || !oppSnap.exists) return { ok: false, reason: 'Profile missing' };
    const me = meSnap.data() as ProfileSnapshot;
    const opp = oppSnap.data() as ProfileSnapshot;
    if (!(me.friends ?? []).includes(opponentUid)) {
      return { ok: false, reason: 'Opponent is not in your friends list' };
    }

    const seed = newSeed();
    const matchId = pvpMatchId(uid, opponentUid, seed);
    const now = Date.now();
    const sortedPlayers: [string, string] = [uid, opponentUid].sort() as [string, string];
    const sortedNames: [string, string] = sortedPlayers[0] === uid
      ? [me.displayName ?? me.farmCode ?? 'Player', opp.displayName ?? opp.farmCode ?? 'Opponent']
      : [opp.displayName ?? opp.farmCode ?? 'Opponent', me.displayName ?? me.farmCode ?? 'Player'];
    const match: PvpMatchSnapshot = {
      matchId,
      players: sortedPlayers,
      playerNames: sortedNames,
      sharedSeed: seed,
      status: 'pending',
      results: {},
      winnerUid: null,
      isDraw: false,
      hrDelta: {},
      createdAtISO: new Date(now).toISOString(),
      resolvedAtISO: null,
      expiresAtISO: new Date(now + PVP_TTL_MS).toISOString(),
    };
    await db.collection('pvpMatches').doc(matchId).set(match);
    return { ok: true, matchId };
  },
);

// ============================================================================
// Helpers (quest progress — unchanged from Phase 3)
// ============================================================================

const QUESTS = [
  { id: 'quest.play_one', goal: 1, gem: 10, kind: 'seasons' as const },
  { id: 'quest.coin_collector', goal: 200, gem: 15, kind: 'coins' as const },
  { id: 'quest.triple_combo', goal: 1, gem: 25, kind: 'triple_combo' as const },
];

function applyQuestProgress(
  state: Record<string, { progress: number; claimed: boolean }>,
  result: { finalCoins: number; combosTotal: { onslaught: number; triadic: number; relentless: number } },
): { completedNow: string[]; gemsAwarded: number } {
  const completedNow: string[] = [];
  let gemsAwarded = 0;
  for (const q of QUESTS) {
    const cur = state[q.id] ?? { progress: 0, claimed: false };
    if (cur.claimed) continue;
    let inc = 0;
    if (q.kind === 'seasons') inc = 1;
    else if (q.kind === 'coins') inc = result.finalCoins;
    else if (q.kind === 'triple_combo') {
      const all = result.combosTotal.onslaught > 0 && result.combosTotal.triadic > 0 && result.combosTotal.relentless > 0;
      inc = all ? 1 : 0;
    }
    const wasComplete = cur.progress >= q.goal;
    const next: { progress: number; claimed: boolean } = {
      progress: cur.progress + inc,
      claimed: cur.claimed,
    };
    state[q.id] = next;
    if (!wasComplete && next.progress >= q.goal) {
      completedNow.push(q.id);
      gemsAwarded += q.gem;
      next.claimed = true;
    }
  }
  return { completedNow, gemsAwarded };
}

function dedupe<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// ============================================================================
// ping (health check)
// ============================================================================

export const ping = onCall(async () => ({ ok: true, ts: Date.now() }));
