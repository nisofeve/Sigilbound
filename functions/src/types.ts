// Phase 3 — Type subset shared with the client engine. Kept manually in sync until
// Phase 5 extracts the engine into a workspace package both sides can import.
// Keep this file PURE (no Firebase imports) so it can be re-used in tests.

export type Rating = 'fail' | 'survive' | 'bronze' | 'silver' | 'gold' | 'mythic';

export interface RunResult {
  finalCoins: number;
  rounds: number;
  combosTotal: { onslaught: number; triadic: number; relentless: number };
  rating: Rating;
}

export interface StartRunRequest {
  perks?: string[];
  ownedUpgradeIds?: string[];
  mode?: 'solo' | 'pvp';
  pvpMatchId?: string;     // Required when mode === 'pvp'.
}

export interface StartRunResponse {
  runId: string;
  seed: number;
  token: string;       // HMAC binding (runId, seed, uid). Echoed back on submit.
  startedAt: number;   // Server timestamp (ms epoch).
  totalRounds: number;
}

export interface SubmitRunRequest {
  runId: string;
  token: string;
  result: RunResult;
  perksUsed: string[];
  ownedUpgradeIds: string[];
  mode?: 'solo' | 'pvp';
  pvpMatchId?: string;
  // Phase 5: actionLog for full server-side replay validation.
}

export interface SubmitRunResponse {
  accepted: boolean;
  rejectionReason?: string;
  rewards: {
    coinsToBank: number;     // Final coins added to spendable bank.
    xp: number;
    gems: number;
    achievementsUnlocked: string[];
    questsCompleted: string[];
  };
  // Updated profile snapshot the client should adopt.
  profile: ProfileSnapshot;
}

// Minimal Profile shape that crosses the wire. Mirrors src/storage/profile.ts on the client.
export interface ProfileSnapshot {
  totalCoinsEarned: number;
  seasonsPlayed: number;
  bestScore: number;
  bestRating: Rating;
  lifetimeCombos: { onslaught: number; triadic: number; relentless: number };
  lastPlayedISO: string | null;
  bankCoins: number;
  upgradesOwned: string[];
  perksOwned: string[];
  perksEquipped: string[];
  gems: number;
  todayQuestsISO: string | null;          // YYYY-MM-DD
  todayQuestsState: Record<string, { progress: number; claimed: boolean }>;
  // Phase 4: social + PvP.
  farmCode: string | null;                 // 6-char human-shareable code, e.g. "B49-721"
  displayName: string | null;
  hr: number;                              // Harvest Rating starts at 1000
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  friends: string[];                       // uids of mutual friends

  // Phase 5: Battle Pass + monetization scaffold.
  bpXp: number;                            // Total XP earned across the active season's BP.
  bpPremium: boolean;                      // Did the player buy / claim the premium track?
  bpClaimedFree: number[];                 // Tier indices (1-based) claimed on free track.
  bpClaimedPremium: number[];              // Tier indices claimed on premium track (only if bpPremium).
  perkShards: number;                      // Crafting currency; earned from runs/quests.
  rejectedRunCount: number;                // Anti-cheat: rejected submissions counter.

  // Phase 6: achievements.
  achievementsUnlocked: string[];          // Achievement IDs that have been awarded.
}

// === Phase 5 — Battle Pass + shop ===

export interface BpClaimRewardRequest { tier: number; track: 'free' | 'premium'; }
export interface BpClaimRewardResponse {
  ok: boolean;
  reason?: string;
  profile: ProfileSnapshot;
}

export interface BuyPremiumPassRequest {
  /** Pretend-IAP cost in gems for Phase 5 (real RevenueCat IAP comes in Phase 6). */
  acknowledgeDevPurchase: true;
}
export interface BuyPremiumPassResponse {
  ok: boolean;
  reason?: string;
  profile: ProfileSnapshot;
}

export interface BuyPerkRequest { perkId: string; payWith: 'gems' | 'shards'; }
export interface BuyPerkResponse {
  ok: boolean;
  reason?: string;
  profile: ProfileSnapshot;
}

// === Friends ===

export interface AddFriendRequest { farmCode: string; }
export interface AddFriendResponse {
  ok: boolean;
  reason?: string;
  friendUid?: string;
  friendDisplayName?: string;
}

export interface RemoveFriendRequest { friendUid: string; }
export interface RemoveFriendResponse { ok: boolean; }

// === PvP ===

export interface CreatePvpChallengeRequest { opponentUid: string; }
export interface CreatePvpChallengeResponse {
  ok: boolean;
  reason?: string;
  matchId?: string;
}

export interface PvpMatchSnapshot {
  matchId: string;
  players: [string, string];               // [uidA, uidB] — sorted alphabetically for stable id
  playerNames: [string, string];
  sharedSeed: number;
  status: 'pending' | 'one_played' | 'resolved';
  results: { [uid: string]: { finalCoins: number; finishedAtISO: string } };
  winnerUid: string | null;                // null if pending or draw
  isDraw: boolean;
  hrDelta: { [uid: string]: number };
  createdAtISO: string;
  resolvedAtISO: string | null;
  expiresAtISO: string;                    // 24h from createdAt per GDD §PvP
}
