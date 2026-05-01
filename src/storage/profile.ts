// Local profile storage — load/save, defaults seeding, run recording, stage
// progression, and the small set of cross-cutting helpers (display name,
// avatar, upgrade purchase, level-reward claim, full reset).
//
// Domain-specific helpers live alongside in this folder:
//   - inventory.ts — card inventory + deck presets
//   - perks.ts     — perk inventory, equip/unequip, run-start consumption
//   - shop.ts      — daily shop rollover/reroll/buy
//
// Backed by localStorage; tiny, synchronous, fits the data. Phase 3 of the
// roadmap migrates to IndexedDB + Firestore sync.

import {
  ACHIEVEMENT_REWARDS,
  allPerks,
  applyQuestProgress,
  evaluateNewlyUnlocked,
  rewardsForLevel,
  levelFromXp,
  todayKey,
  getStageDef,
  starsFor,
  replayRewardsFor,
  combatStageRewards,
  combatStageReplayRewards,
  combatStarsFor,
  XP_FROM_SEASON_COMPLETE,
  XP_PER_RUN_COIN,
  XP_FROM_ACHIEVEMENT_BY_RARITY,
  MAX_LEVEL,
  type CardId,
  type Grade,
  type LevelReward,
  type Rating,
  type RunResult,
  type StageReward,
  type CombatStageDef,
  type CombatStageReward,
  sumUpgradeEffect,
  rollStageDrops,
  type ItemDrop,
} from '@engine/index';
import { addPerkCharges, isStarterPerk } from './perks';
import {
  STARTER_DECK_IDS,
  STARTER_PERKS,
  STORAGE_KEY,
  type DeckEntry,
  type Profile,
  type RecordRunOutcome,
  type StageRunOutcome,
} from './types';

// === Empty profile + withDefaults ===

const empty: Profile = {
  totalCoinsEarned: 0,
  seasonsPlayed: 0,
  bestScore: 0,
  bestRating: 'fail',
  lifetimeCombos: { onslaught: 0, triadic: 0, relentless: 0 },
  lastPlayedISO: null,
  bankCoins: 0,
  upgradesOwned: [],
  perksOwned: [],
  perksInventory: {},
  perksEquipped: [],
  gems: 0,
  todayQuestsISO: null,
  todayQuestsState: {},
  farmCode: null,
  displayName: null,
  hr: 1000,
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
  tutorialSeen: false,
  cardInventory: {},
  deckPresets: [],
  activeDeckPreset: 0,
  dailyShopISO: null,
  dailyShopBoughtIds: [],
  dailyShopRerolls: 0,
  dailyPerkShopRerolls: 0,
  playerXp: 0,
  claimedLevels: [],
  avatarEmoji: '⚔️',
  currentStage: 1,
  stageStars: {},
  stageRewardsClaimed: {},
  // Phase 7 — Sigilbound combat collection. New profiles get a default
  // starter set so combat is playable immediately. seedCombatStarter()
  // tops up missing entries on every withDefaults() pass so existing
  // saves migrate forward without an explicit version bump.
  combatCardInventory: {},
  combatDeck: [],
  combatCardTiers: {},
  combatShopISO: null,
  combatShopBoughtIds: [],
  combatShopBoughtCounts: {},
  combatShopRerolls: 0,
};

// Default starter combat collection. Loaded on first run + topped up by
// withDefaults() so legacy saves migrate forward. Tuned for a playable
// run on stage 1 without any equipment.
const COMBAT_STARTER_DECK: ReadonlyArray<string> = [
  'act_001', 'act_001', 'act_001',  // 3 Strike (1-charge Steel)
  'act_002', 'act_002',              // 2 Slash
  'act_011',                          // 1 Firebolt
  'act_015',                          // 1 Frost Shard
  'act_019',                          // 1 Arcane Bolt
  'tac_001', 'tac_002',              // Block + Bandage
];

function seedCombatStarter(p: Profile): Profile {
  // Ensure the player owns at least one of each starter card. Existing
  // counts are preserved if higher.
  const inv = { ...p.combatCardInventory };
  const counts = new Map<string, number>();
  for (const id of COMBAT_STARTER_DECK) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, c] of counts) {
    inv[id] = Math.max(inv[id] ?? 0, c);
  }
  return {
    ...p,
    combatCardInventory: inv,
    combatDeck: p.combatDeck.length > 0 ? p.combatDeck : [...COMBAT_STARTER_DECK],
  };
}

function withDefaults(partial: Partial<Profile>): Profile {
  // Sigilbound migration: legacy Plotbound saves had lifetimeCombos keyed by
  // `abundance/gardenVariety/loyal`. Map them onto the new combo names so
  // existing players don't lose their lifetime tallies. Safe to leave in
  // permanently — once migrated, the legacy keys disappear.
  const legacyCombos = (partial.lifetimeCombos ?? {}) as Partial<Record<string, number>>;
  const migratedCombos = {
    onslaught: (legacyCombos.onslaught ?? legacyCombos.abundance ?? 0) as number,
    triadic: (legacyCombos.triadic ?? legacyCombos.gardenVariety ?? 0) as number,
    relentless: (legacyCombos.relentless ?? legacyCombos.loyal ?? 0) as number,
  };

  let p: Profile = {
    ...empty,
    ...partial,
    lifetimeCombos: migratedCombos,
    todayQuestsState: { ...empty.todayQuestsState, ...partial.todayQuestsState },
    cardInventory: { ...empty.cardInventory, ...partial.cardInventory },
    perksInventory: { ...empty.perksInventory, ...partial.perksInventory },
    deckPresets: partial.deckPresets ?? empty.deckPresets,
    dailyShopBoughtIds: partial.dailyShopBoughtIds ?? empty.dailyShopBoughtIds,
    dailyShopRerolls: partial.dailyShopRerolls ?? empty.dailyShopRerolls,
    dailyPerkShopRerolls: partial.dailyPerkShopRerolls ?? empty.dailyPerkShopRerolls,
    currentStage: partial.currentStage ?? empty.currentStage,
    stageStars: { ...empty.stageStars, ...partial.stageStars },
    stageRewardsClaimed: { ...empty.stageRewardsClaimed, ...partial.stageRewardsClaimed },
    // Phase 7 — combat collection migration.
    combatCardInventory: partial.combatCardInventory ?? empty.combatCardInventory,
    combatCardTiers: partial.combatCardTiers ?? empty.combatCardTiers,
    combatDeck: partial.combatDeck ?? empty.combatDeck,
    combatShopISO: partial.combatShopISO ?? empty.combatShopISO,
    combatShopBoughtIds: partial.combatShopBoughtIds ?? empty.combatShopBoughtIds,
    combatShopBoughtCounts: partial.combatShopBoughtCounts ?? empty.combatShopBoughtCounts,
    combatShopRerolls: partial.combatShopRerolls ?? empty.combatShopRerolls,
  };
  p = seedCombatStarter(p);
  // Ensure starter perks always present for new accounts.
  for (const id of STARTER_PERKS) if (!p.perksOwned.includes(id)) p.perksOwned.push(id);
  // Migration: legacy profiles may have non-starter perks in `perksOwned`
  // from before consumable perks existed. Move each one to the inventory
  // with 1 charge so the player keeps what they paid for.
  for (const id of p.perksOwned) {
    if (isStarterPerk(id)) continue;
    if (p.perksInventory[id] === undefined) p.perksInventory[id] = 1;
  }
  // An equipped perk needs to either be a starter OR have at least 1 charge.
  p.perksEquipped = p.perksEquipped.filter(id =>
    isStarterPerk(id) || (p.perksInventory[id] ?? 0) > 0,
  );
  // Drop equipped perks that don't exist in current data.
  const validIds = new Set(allPerks().map(perk => perk.id));
  p.perksOwned = p.perksOwned.filter(id => validIds.has(id));
  p.perksEquipped = p.perksEquipped.filter(id => validIds.has(id));
  // Clean dead inventory entries.
  for (const id of Object.keys(p.perksInventory)) {
    if (!validIds.has(id) || p.perksInventory[id] <= 0) delete p.perksInventory[id];
  }

  // Seed starter deck preset + inventory on first launch / migration.
  // If the player has zero cards across the whole inventory, give them the
  // starter deck flattened to inventory (all grade F) and one default preset
  // built from the same cards.
  const totalOwnedCards = Object.values(p.cardInventory).reduce(
    (n, byGrade) => n + Object.values(byGrade).reduce((m, c) => m + (c ?? 0), 0),
    0,
  );
  if (totalOwnedCards === 0 || p.deckPresets.length === 0) {
    if (totalOwnedCards === 0) {
      const inv: Record<CardId, Partial<Record<Grade, number>>> = {};
      for (const id of STARTER_DECK_IDS) {
        inv[id] = inv[id] ?? {};
        inv[id]!.F = (inv[id]!.F ?? 0) + 1;
      }
      p.cardInventory = inv;
    }
    if (p.deckPresets.length === 0) {
      // Build 5 empty presets, with preset 0 pre-filled with the starter deck
      // so a fresh player can hit Start immediately without configuring.
      const starterEntries = makeEntriesFromIds(STARTER_DECK_IDS, 'F');
      p.deckPresets = [
        { name: 'Default Deck', entries: starterEntries },
        { name: 'Preset 2', entries: [] },
        { name: 'Preset 3', entries: [] },
        { name: 'Preset 4', entries: [] },
        { name: 'Preset 5', entries: [] },
      ];
      p.activeDeckPreset = 0;
    }
  }
  if (p.activeDeckPreset < 0 || p.activeDeckPreset >= p.deckPresets.length) {
    p.activeDeckPreset = 0;
  }
  return p;
}

function makeEntriesFromIds(ids: CardId[], grade: Grade): DeckEntry[] {
  const counts = new Map<CardId, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts.entries()).map(([cardId, count]) => ({ cardId, grade, count }));
}

// === Load / save / set / reset ===

export function setProfile(profile: Profile): Profile {
  // Used by cloud sync to atomically replace the local profile.
  const cleaned = withDefaults(profile);
  saveProfile(cleaned);
  return cleaned;
}

export function loadProfile(): Profile {
  if (typeof localStorage === 'undefined') return withDefaults({});
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return withDefaults({});
    return withDefaults(JSON.parse(raw) as Partial<Profile>);
  } catch {
    return withDefaults({});
  }
}

export function saveProfile(p: Profile): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

// Wipe all persisted progress and return a freshly-seeded profile. The
// returned profile has the starter deck + starter perks back in place
// (via withDefaults) so the player can hit Start Farming immediately.
// `keepTutorialSeen` lets the caller skip re-showing the welcome modal —
// defaults to true so a returning player doesn't suddenly see onboarding.
export function resetProfile(opts: { keepTutorialSeen?: boolean } = {}): Profile {
  const keepTutorialSeen = opts.keepTutorialSeen ?? true;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
  const fresh = withDefaults({});
  if (keepTutorialSeen) fresh.tutorialSeen = true;
  saveProfile(fresh);
  return fresh;
}

// === Cosmetics ===

export function setDisplayName(profile: Profile, name: string): Profile {
  const trimmed = name.trim().slice(0, 20);
  const next: Profile = { ...profile, displayName: trimmed.length > 0 ? trimmed : null };
  saveProfile(next);
  return next;
}

export function setAvatarEmoji(profile: Profile, emoji: string): Profile {
  // First grapheme only, so a complex emoji like 👨‍🌾 still works.
  const next: Profile = { ...profile, avatarEmoji: [...emoji][0] ?? '⚔️' };
  saveProfile(next);
  return next;
}

// === Upgrade purchase ===

export function buyUpgrade(profile: Profile, upgradeId: string, cost: number): Profile {
  if (profile.upgradesOwned.includes(upgradeId)) return profile;
  if (profile.bankCoins < cost) return profile;
  const next: Profile = {
    ...profile,
    bankCoins: profile.bankCoins - cost,
    upgradesOwned: [...profile.upgradesOwned, upgradeId],
  };
  saveProfile(next);
  return next;
}

// === Run recording + stage progression ===

function isBetterRating(a: Rating, b: Rating): boolean {
  const order: Rating[] = ['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic'];
  return order.indexOf(a) > order.indexOf(b);
}

export function recordRun(result: RunResult): RecordRunOutcome {
  const p = loadProfile();
  p.totalCoinsEarned += result.finalCoins;
  p.seasonsPlayed += 1;
  if (result.finalCoins > p.bestScore) p.bestScore = result.finalCoins;
  if (isBetterRating(result.rating, p.bestRating)) p.bestRating = result.rating;
  p.lifetimeCombos.onslaught += result.combosTotal.onslaught;
  p.lifetimeCombos.triadic += result.combosTotal.triadic;
  p.lifetimeCombos.relentless += result.combosTotal.relentless;
  p.lastPlayedISO = new Date().toISOString();
  p.bankCoins += result.finalCoins;

  // Roll over quests if a new UTC day has begun.
  const today = todayKey();
  if (p.todayQuestsISO !== today) {
    p.todayQuestsISO = today;
    p.todayQuestsState = {};
  }
  const update = applyQuestProgress(p.todayQuestsState, result);
  p.todayQuestsState = update.state;
  p.gems += update.gemsAwarded;

  // Phase 6: evaluate achievements against the now-updated profile + this run.
  const newAchievements = evaluateNewlyUnlocked({ profile: p, lastRun: result });
  let achievementXp = 0;
  for (const a of newAchievements) {
    const reward = ACHIEVEMENT_REWARDS[a.rarity];
    p.bankCoins += reward.coins;
    p.gems += reward.gems;
    p.achievementsUnlocked = [...p.achievementsUnlocked, a.id];
    achievementXp += XP_FROM_ACHIEVEMENT_BY_RARITY[a.rarity] ?? 0;
  }

  // Phase 9: grant player XP from this run.
  // Cap is enforced by levelFromXp/totalXpForLevel; we just keep accumulating.
  const seasonXp = XP_FROM_SEASON_COMPLETE + Math.round(result.finalCoins * XP_PER_RUN_COIN);
  p.playerXp = Math.max(0, p.playerXp + seasonXp + achievementXp);

  // Stage progression — only when this run was tied to a stage.
  let stageOutcome: StageRunOutcome | null = null;
  if (typeof result.stageNumber === 'number' && result.stageNumber >= 1) {
    stageOutcome = applyStageProgress(p, result);
  }

  saveProfile(p);
  return {
    profile: p,
    questsCompleted: update.completedNow,
    gemsAwarded: update.gemsAwarded,
    achievementsUnlocked: newAchievements.map((a) => a.id),
    stageOutcome,
  };
}

// Public entry point used by App.tsx when a cloud-accepted run still
// needs local stage progression applied (cloud functions don't know about
// stages). Returns the granted-rewards summary AND the updated profile.
export function applyStageOutcomeToProfile(profile: Profile, result: RunResult): { profile: Profile; outcome: StageRunOutcome | null } {
  if (typeof result.stageNumber !== 'number' || result.stageNumber < 1) {
    return { profile, outcome: null };
  }
  const next: Profile = {
    ...profile,
    stageStars: { ...profile.stageStars },
    stageRewardsClaimed: { ...profile.stageRewardsClaimed },
    perksInventory: { ...profile.perksInventory },
    cardInventory: { ...profile.cardInventory },
    perksOwned: profile.perksOwned.slice(),
  };
  const outcome = applyStageProgress(next, result);
  saveProfile(next);
  return { profile: next, outcome };
}

// Mutates `p` in place: updates stageStars, currentStage, and pays out
// the appropriate first-clear chest OR replay reward. Returns a snapshot
// of what was granted so the result UI can show it. Star math is purely
// from result.orders (counts fulfilled vs total).
function applyStageProgress(p: Profile, result: RunResult): StageRunOutcome {
  const stage = result.stageNumber as number;
  const total = result.orders.length;
  const fulfilled = result.orders.filter(o => o.fulfilled).length;
  const stars = starsFor(total, fulfilled);

  const prevBest = p.stageStars[stage] ?? 0;
  if (stars > prevBest) p.stageStars = { ...p.stageStars, [stage]: stars as 1 | 2 | 3 };

  // 1+ stars unlocks the next stage.
  if (stars >= 1 && p.currentStage < stage + 1) {
    p.currentStage = stage + 1;
  }

  // First-clear payouts: granted once per (stage, star tier) — i.e. clearing
  // a stage at 2 stars after a previous 1-star clear pays the gap up to 2.
  // We track the highest star tier whose chest has already been paid.
  const claimedTier = p.stageRewardsClaimed[stage] ?? 0;
  let firstClearAtTier: 0 | 1 | 2 | 3 = 0;
  let granted: StageReward[] = [];
  if (stars > 0 && stars > claimedTier) {
    const def = getStageDef(stage);
    granted = stars === 3 ? def.rewards.threeStars
            : stars === 2 ? def.rewards.twoStars
            :               def.rewards.oneStar;
    firstClearAtTier = stars as 1 | 2 | 3;
    p.stageRewardsClaimed = { ...p.stageRewardsClaimed, [stage]: stars as 1 | 2 | 3 };
  } else if (stars > 0) {
    // Replay — currency only (small payout). First-clear chest already
    // claimed at this tier or higher.
    granted = replayRewardsFor(stage, stars as 1 | 2 | 3);
  }
  applyStageRewards(p, granted);

  return { stageNumber: stage, stars, firstClearAtTier, rewardsGranted: granted };
}

// Apply rewards directly to the profile (mutates). Used by stage clears.
function applyStageRewards(p: Profile, rewards: StageReward[]): void {
  for (const r of rewards) {
    switch (r.type) {
      case 'coins': p.bankCoins += r.value ?? 0; p.totalCoinsEarned += r.value ?? 0; break;
      case 'gems':  p.gems += r.value ?? 0; break;
      case 'shards': p.perkShards += r.value ?? 0; break;
      case 'xp':    p.playerXp = Math.max(0, p.playerXp + (r.value ?? 0)); break;
      case 'card': {
        if (!r.cardId || !r.count) break;
        const inv: Profile['cardInventory'] = { ...p.cardInventory, [r.cardId]: { ...(p.cardInventory[r.cardId] ?? {}) } };
        inv[r.cardId]!.F = (inv[r.cardId]!.F ?? 0) + r.count;
        p.cardInventory = inv;
        break;
      }
      case 'perk': {
        if (!r.perkId || !r.count) break;
        if (isStarterPerk(r.perkId)) break;
        const newInv = { ...p.perksInventory };
        newInv[r.perkId] = (newInv[r.perkId] ?? 0) + r.count;
        p.perksInventory = newInv;
        if (!p.perksOwned.includes(r.perkId)) p.perksOwned = [...p.perksOwned, r.perkId];
        break;
      }
    }
  }
}

// === Combat clear reward application ===

export interface CombatClearOutcome {
  stars: 0 | 1 | 2 | 3;
  firstClearAtTier: 0 | 1 | 2 | 3;        // 0 = no new first-clear chest opened
  rewardsGranted: CombatStageReward[];
  itemDrops: ItemDrop[];                   // equipment / talent / card drops (first-clear only)
  newCurrentStage: number;                 // stage after this clear (unchanged on defeat)
}

/**
 * Apply a combat stage clear (or defeat) to the profile and persist.
 * - Defeat: nothing changes; returned outcome reports 0 stars.
 * - Clear: stars are computed from final HP, currentStage advances,
 *   stageStars updates, and either the first-clear chest at this star
 *   tier OR a smaller replay reward is granted.
 */
export function applyCombatClearToProfile(
  profile: Profile,
  stage: CombatStageDef,
  result: { cleared: boolean; currentHp: number; maxHp: number; hardcore?: boolean },
): { profile: Profile; outcome: CombatClearOutcome } {
  const stars = combatStarsFor({
    cleared: result.cleared,
    currentHp: result.currentHp,
    maxHp: result.maxHp,
  });

  if (stars === 0) {
    return {
      profile,
      outcome: { stars: 0, firstClearAtTier: 0, rewardsGranted: [], itemDrops: [], newCurrentStage: profile.currentStage },
    };
  }

  // Clone the profile so we don't mutate the caller's reference.
  const next: Profile = {
    ...profile,
    stageStars: { ...profile.stageStars },
    stageRewardsClaimed: { ...profile.stageRewardsClaimed },
  };

  const stageNum = stage.number;
  const prevBestStars = next.stageStars[stageNum] ?? 0;
  if (stars > prevBestStars) {
    next.stageStars = { ...next.stageStars, [stageNum]: stars };
  }
  if (next.currentStage < stageNum + 1) {
    next.currentStage = stageNum + 1;
  }

  // Determine reward tier: first-clear at a higher star count than ever
  // before pays the full chest; otherwise it's a (smaller) replay reward.
  const claimedTier = next.stageRewardsClaimed[stageNum] ?? 0;
  let rewardsGranted: CombatStageReward[];
  let firstClearAtTier: 0 | 1 | 2 | 3 = 0;
  if (stars > claimedTier) {
    rewardsGranted = combatStageRewards(stage, stars);
    firstClearAtTier = stars;
    next.stageRewardsClaimed = { ...next.stageRewardsClaimed, [stageNum]: stars };
  } else {
    rewardsGranted = combatStageReplayRewards(stage, stars);
  }

  // Hardcore mode grants 1.5× all currency rewards.
  const hardcoreMult = result.hardcore ? 1.5 : 1;

  // Stronghold "Treasure Sense" / "Hoarder" boost coin drops.
  const goldBonus = sumUpgradeEffect(profile.upgradesOwned, 'gold_drop_bonus');
  const coinMult = 1 + goldBonus;
  // Stronghold "Merchant Blessing" / "Trade Network" / "Diamond Market" —
  // sales bonus also folds into stage gold (treats the chest as a "sale").
  const saleMult = 1 + sumUpgradeEffect(profile.upgradesOwned, 'global_sale_mult');
  const totalCoinMult = coinMult * saleMult * hardcoreMult;

  // Apply reward currencies.
  for (const r of rewardsGranted) {
    switch (r.type) {
      case 'coins': {
        const amount = Math.round(r.value * totalCoinMult);
        next.bankCoins = next.bankCoins + amount;
        next.totalCoinsEarned = next.totalCoinsEarned + amount;
        break;
      }
      case 'gems':
        next.gems = next.gems + Math.round(r.value * hardcoreMult);
        break;
      case 'shards':
        next.perkShards = next.perkShards + Math.round(r.value * hardcoreMult);
        break;
      case 'xp':
        next.playerXp = Math.max(0, next.playerXp + Math.round(r.value * hardcoreMult));
        break;
    }
  }

  // Roll and apply item drops (first-clear only).
  const itemDrops = rollStageDrops(stage, stars, firstClearAtTier > 0);
  for (const drop of itemDrops) {
    if (drop.kind === 'combat_card') {
      next.combatCardInventory = {
        ...next.combatCardInventory,
        [drop.cardId]: (next.combatCardInventory[drop.cardId] ?? 0) + drop.count,
      };
    } else if (drop.kind === 'equipment') {
      next.combatCardInventory = {
        ...next.combatCardInventory,
        [drop.equipmentId]: (next.combatCardInventory[drop.equipmentId] ?? 0) + 1,
      };
    } else if (drop.kind === 'talent') {
      next.perksInventory = {
        ...next.perksInventory,
        [drop.talentId]: (next.perksInventory[drop.talentId] ?? 0) + drop.count,
      };
      if (!next.perksOwned.includes(drop.talentId)) {
        next.perksOwned = [...next.perksOwned, drop.talentId];
      }
    }
  }

  saveProfile(next);
  return {
    profile: next,
    outcome: { stars, firstClearAtTier, rewardsGranted, itemDrops, newCurrentStage: next.currentStage },
  };
}

// === Player level reward claim ===

// Claim the reward chest for a given level. Returns the updated profile (with
// the level marked claimed and the rewards applied) or null if invalid: level
// hasn't been reached, or already claimed.
export function claimLevelReward(profile: Profile, level: number): { profile: Profile; rewards: LevelReward[] } | null {
  const earned = levelFromXp(profile.playerXp);
  if (level < 1 || level > MAX_LEVEL) return null;
  if (level > earned) return null;
  if (profile.claimedLevels.includes(level)) return null;
  const rewards = rewardsForLevel(level);
  let next: Profile = {
    ...profile,
    claimedLevels: [...profile.claimedLevels, level],
  };
  for (const r of rewards) {
    if (r.type === 'coins')  next = { ...next, bankCoins: next.bankCoins + r.value };
    else if (r.type === 'gems')   next = { ...next, gems: next.gems + r.value };
    else if (r.type === 'shards') next = { ...next, perkShards: next.perkShards + r.value };
    else if (r.type === 'card') {
      // Sigilbound: card rewards land in the combat card inventory. Legacy
      // grade-F seed inventory is no longer fed by leveling.
      next = {
        ...next,
        combatCardInventory: {
          ...next.combatCardInventory,
          [r.cardId]: (next.combatCardInventory[r.cardId] ?? 0) + r.count,
        },
      };
    } else if (r.type === 'perk') {
      next = addPerkCharges(next, r.perkId, r.count);
    }
  }
  saveProfile(next);
  return { profile: next, rewards };
}
