// Phase 4 — social + PvP cloud wrappers and Firestore queries.
//
// Friend ops (addFriend / removeFriend / createPvpChallenge) go through
// callable Cloud Functions for atomic mutual updates and validation.
// Read-only listings (friend profiles, match list) query Firestore directly.

import { httpsCallable } from 'firebase/functions';
import {
  collection, doc, getDoc, getDocs, query, where,
  documentId, type DocumentData,
} from 'firebase/firestore';
import { getFirebase } from './client';

export interface FriendProfile {
  uid: string;
  farmCode: string | null;
  displayName: string | null;
  bestScore: number;
  hr: number;
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  seasonsPlayed: number;
}

export interface PvpMatch {
  matchId: string;
  players: [string, string];
  playerNames: [string, string];
  sharedSeed: number;
  status: 'pending' | 'one_played' | 'resolved';
  results: { [uid: string]: { finalCoins: number; finishedAtISO: string } };
  winnerUid: string | null;
  isDraw: boolean;
  hrDelta: { [uid: string]: number };
  createdAtISO: string;
  resolvedAtISO: string | null;
  expiresAtISO: string;
}

// ---------- Friend mutations ----------

export async function addFriendByCode(farmCode: string): Promise<{ ok: boolean; reason?: string; friendUid?: string; friendDisplayName?: string }> {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: 'Cloud disabled' };
  try {
    const fn = httpsCallable<{ farmCode: string }, { ok: boolean; reason?: string; friendUid?: string; friendDisplayName?: string }>(
      fb.functions, 'addFriend',
    );
    const res = await fn({ farmCode });
    return res.data;
  } catch (err) {
    console.warn('[addFriend] failed:', err);
    return { ok: false, reason: 'Network error' };
  }
}

export async function removeFriend(friendUid: string): Promise<{ ok: boolean }> {
  const fb = getFirebase();
  if (!fb) return { ok: false };
  try {
    const fn = httpsCallable<{ friendUid: string }, { ok: boolean }>(fb.functions, 'removeFriend');
    const res = await fn({ friendUid });
    return res.data;
  } catch (err) {
    console.warn('[removeFriend] failed:', err);
    return { ok: false };
  }
}

// ---------- Friend list query ----------

export async function fetchFriendProfiles(friendUids: string[]): Promise<FriendProfile[]> {
  const fb = getFirebase();
  if (!fb || friendUids.length === 0) return [];

  // Firestore 'in' queries cap at 30 ids per query (was 10 — recently bumped).
  // For Phase 4's friend cap of 200, chunk in 30s.
  const chunks: string[][] = [];
  for (let i = 0; i < friendUids.length; i += 30) chunks.push(friendUids.slice(i, i + 30));

  const out: FriendProfile[] = [];
  for (const chunk of chunks) {
    const q = query(collection(fb.firestore, 'profiles'), where(documentId(), 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach(d => {
      const p = d.data() as DocumentData;
      out.push({
        uid: d.id,
        farmCode: p.farmCode ?? null,
        displayName: p.displayName ?? null,
        bestScore: p.bestScore ?? 0,
        hr: p.hr ?? 1000,
        pvpWins: p.pvpWins ?? 0,
        pvpLosses: p.pvpLosses ?? 0,
        pvpDraws: p.pvpDraws ?? 0,
        seasonsPlayed: p.seasonsPlayed ?? 0,
      });
    });
  }
  return out;
}

// ---------- PvP ----------

export async function createPvpChallenge(opponentUid: string): Promise<{ ok: boolean; reason?: string; matchId?: string }> {
  const fb = getFirebase();
  if (!fb) return { ok: false, reason: 'Cloud disabled' };
  try {
    const fn = httpsCallable<{ opponentUid: string }, { ok: boolean; reason?: string; matchId?: string }>(
      fb.functions, 'createPvpChallenge',
    );
    const res = await fn({ opponentUid });
    return res.data;
  } catch (err) {
    console.warn('[createPvpChallenge] failed:', err);
    return { ok: false, reason: 'Network error' };
  }
}

export async function fetchPvpMatchesFor(uid: string): Promise<PvpMatch[]> {
  const fb = getFirebase();
  if (!fb) return [];
  // Firestore array-contains query — players is the sorted [uidA, uidB] array.
  const q = query(collection(fb.firestore, 'pvpMatches'), where('players', 'array-contains', uid));
  const snap = await getDocs(q);
  const out: PvpMatch[] = [];
  snap.forEach(d => out.push({ matchId: d.id, ...(d.data() as Omit<PvpMatch, 'matchId'>) }));
  return out.sort((a, b) => (a.createdAtISO > b.createdAtISO ? -1 : 1));
}

export async function fetchPvpMatch(matchId: string): Promise<PvpMatch | null> {
  const fb = getFirebase();
  if (!fb) return null;
  const ref = doc(fb.firestore, 'pvpMatches', matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { matchId, ...(snap.data() as Omit<PvpMatch, 'matchId'>) };
}
