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
  allAchievements,
  allActions,
  allTactics,
  allPerks,
  allTalents,
  applyQuestProgress,
  applyCombatQuestProgress,
  type CombatRunResult,
  evaluateNewlyUnlocked,
  rewardsForLevel,
  levelFromXp,
  todayKey,
  weekKey,
  monthKey,
  questsByPeriod,
  applyActionQuestProgress,
  type QuestAction,
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
  TOTAL_BP_TIERS,
  XP_PER_TIER,
  VIP_PASS_GEM_COST,
  allBpTiers,
  xpFromCombatClear,
  type CardId,
  type Grade,
  type LevelReward,
  type Rating,
  type RunResult,
  type StageReward,
  type CombatStageDef,
  type CombatStageReward,
  type BpRewardItem,
  sumUpgradeEffect,
  rollStageDrops,
  type ItemDrop,
  cardTierCapForBossCount,
  getLoreMilestone,
} from '@engine/index';
import { addPerkCharges, isStarterPerk } from './perks';
import questsJson from '@data/quests.json';
import {
  MAX_COMBAT_DECK_SETS,
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
  achievementsClaimed: [],
  tutorialSeen: false,
  tutorialCompleted: false,
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
  combatDeckSets: [],
  activeCombatDeckSet: 0,
  combatCardTiers: {},
  combatShopISO: null,
  combatShopBoughtIds: [],
  combatShopBoughtCounts: {},
  combatShopRerolls: 0,
  // F1–F6: Retention features
  hardmodeUnlockedThrough: 0,
  hardmodeStageStars: {},
  hardmodeRewardsClaimed: {},
  bossesDefeated: 0,
  bossesDefeatedByStage: {},
  cardTierCap: 3,
  enemyPrestigeLevel: 0,
  allTimeHighScore: 0,
  weeklyHighScore: 0,
  weeklyScoreISO: null,
  loreMilestonesUnlocked: [],
  cosmeticsUnlocked: [],
  activeCardBack: null,
  bpSeasonISO: null,
  bpSeasonNumber: 0,
  weekQuestsISO: null,
  weekQuestsState: {},
  monthQuestsISO: null,
  monthQuestsState: {},
};

// Default starter combat collection. Loaded on first run + topped up by
// withDefaults() so legacy saves migrate forward. Tuned for a playable
// run on stage 1 without any equipment.
const COMBAT_STARTER_DECK: ReadonlyArray<string> = [
  'act_001', 'act_001',  // 2 Strike (1-charge Steel)
  'act_002', 'act_002',  // 2 Slash
  'act_011',             // 1 Firebolt
  'act_015',             // 1 Frost Shard
  'act_019',             // 1 Arcane Bolt
  'tac_001', 'tac_001',  // 2 Block
  'tac_002',             // Bandage
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
    combatDeckSets: partial.combatDeckSets ?? empty.combatDeckSets,
    activeCombatDeckSet: partial.activeCombatDeckSet ?? empty.activeCombatDeckSet,
    combatShopISO: partial.combatShopISO ?? empty.combatShopISO,
    combatShopBoughtIds: partial.combatShopBoughtIds ?? empty.combatShopBoughtIds,
    combatShopBoughtCounts: partial.combatShopBoughtCounts ?? empty.combatShopBoughtCounts,
    combatShopRerolls: partial.combatShopRerolls ?? empty.combatShopRerolls,
    // F1–F6: Retention features
    hardmodeUnlockedThrough: partial.hardmodeUnlockedThrough ?? empty.hardmodeUnlockedThrough,
    hardmodeStageStars: { ...empty.hardmodeStageStars, ...partial.hardmodeStageStars },
    hardmodeRewardsClaimed: { ...empty.hardmodeRewardsClaimed, ...partial.hardmodeRewardsClaimed },
    bossesDefeated: partial.bossesDefeated ?? empty.bossesDefeated,
    bossesDefeatedByStage: { ...empty.bossesDefeatedByStage, ...partial.bossesDefeatedByStage },
    cardTierCap: partial.cardTierCap ?? empty.cardTierCap,
    enemyPrestigeLevel: partial.enemyPrestigeLevel ?? empty.enemyPrestigeLevel,
    allTimeHighScore: partial.allTimeHighScore ?? empty.allTimeHighScore,
    weeklyHighScore: partial.weeklyHighScore ?? empty.weeklyHighScore,
    weeklyScoreISO: partial.weeklyScoreISO ?? empty.weeklyScoreISO,
    loreMilestonesUnlocked: partial.loreMilestonesUnlocked ?? empty.loreMilestonesUnlocked,
    cosmeticsUnlocked: partial.cosmeticsUnlocked ?? empty.cosmeticsUnlocked,
    activeCardBack: partial.activeCardBack ?? empty.activeCardBack,
    bpSeasonISO: partial.bpSeasonISO ?? empty.bpSeasonISO,
    bpSeasonNumber: partial.bpSeasonNumber ?? empty.bpSeasonNumber,
    weekQuestsISO: partial.weekQuestsISO ?? empty.weekQuestsISO,
    weekQuestsState: { ...empty.weekQuestsState, ...partial.weekQuestsState },
    monthQuestsISO: partial.monthQuestsISO ?? empty.monthQuestsISO,
    monthQuestsState: { ...empty.monthQuestsState, ...partial.monthQuestsState },
  };
  p = seedCombatStarter(p);
  // Migration: legacy saves have no achievementsClaimed field. Mark all
  // already-unlocked achievements as claimed so existing players keep rewards.
  if (!p.achievementsClaimed) p.achievementsClaimed = [...p.achievementsUnlocked];
  // Migration: ensure combatDeckSets exists. Promote the active combatDeck
  // to Set 0 if sets are empty so existing saves keep their deck.
  if (!p.combatDeckSets || p.combatDeckSets.length === 0) {
    p.combatDeckSets = [
      { name: 'Deck 1', cards: p.combatDeck.length > 0 ? [...p.combatDeck] : [] },
    ];
    p.activeCombatDeckSet = 0;
  }
  // Pad to MAX_COMBAT_DECK_SETS slots with empty entries.
  while (p.combatDeckSets.length < MAX_COMBAT_DECK_SETS) {
    p.combatDeckSets.push({ name: `Deck ${p.combatDeckSets.length + 1}`, cards: [] });
  }
  // Sanitize: enforce max-2 copies of any card per deck set (handles old saves).
  p.combatDeckSets = p.combatDeckSets.map(s => {
    const seen = new Map<string, number>();
    const cards = s.cards.filter(id => {
      const n = seen.get(id) ?? 0;
      if (n >= 2) return false;
      seen.set(id, n + 1);
      return true;
    });
    return { ...s, cards };
  });
  // Keep combatDeck in sync with the active set.
  p.combatDeck = p.combatDeckSets[p.activeCombatDeckSet]?.cards ?? [];
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
  // validIds must include both legacy perks (perk.*) AND new talents (talent.*)
  // so starter talents like talent.battlecry survive the filter.
  const validIds = new Set([
    ...allPerks().map(perk => perk.id),
    ...allTalents().map(t => t.id),
  ]);
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
    localStorage.removeItem('sigilbound:redeemedCodes');
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

// === Achievement evaluation ===

// Run the achievement predicates against the current profile (and an optional
// last-run snapshot for per-run-only predicates), award rarity-based coin/gem
// rewards for any newly satisfied entries, and return the updated profile +
// the list of unlocked Achievement objects so the caller can surface them.
//
// Caller is responsible for saveProfile/persistence — this helper is pure.
export function applyAchievementUnlocks(
  profile: Profile,
  lastRun?: RunResult,
): { profile: Profile; unlocked: Array<{ id: string; rarity: string; name: string; icon: string; rewardCoins: number; rewardGems: number }> } {
  // Guard against minimal test profiles that don't populate every field
  // the evaluator reads. Real loaded profiles always have these via
  // withDefaults; this just prevents test scaffolding from blowing up.
  if (!profile.achievementsUnlocked) return { profile, unlocked: [] };
  const newly = evaluateNewlyUnlocked({ profile, lastRun });
  if (newly.length === 0) return { profile, unlocked: [] };
  const next: Profile = {
    ...profile,
    achievementsUnlocked: [...profile.achievementsUnlocked, ...newly.map(a => a.id)],
  };
  const unlocked: Array<{ id: string; rarity: string; name: string; icon: string; rewardCoins: number; rewardGems: number }> = [];
  for (const a of newly) {
    const reward = ACHIEVEMENT_REWARDS[a.rarity];
    unlocked.push({
      id: a.id, rarity: a.rarity, name: a.name, icon: a.icon,
      rewardCoins: reward.coins, rewardGems: reward.gems,
    });
  }
  return { profile: next, unlocked };
}

// Claim the reward for a single unlocked achievement. No-op if already claimed
// or not yet unlocked. Caller must persist.
export function claimAchievementReward(profile: Profile, achievementId: string): Profile | null {
  if (!profile.achievementsUnlocked.includes(achievementId)) return null;
  if ((profile.achievementsClaimed ?? []).includes(achievementId)) return null;
  const a = allAchievements().find(x => x.id === achievementId);
  if (!a) return null;
  const reward = ACHIEVEMENT_REWARDS[a.rarity];
  return {
    ...profile,
    achievementsClaimed: [...(profile.achievementsClaimed ?? []), achievementId],
    bankCoins: profile.bankCoins + reward.coins,
    totalCoinsEarned: profile.totalCoinsEarned + reward.coins,
    gems: profile.gems + reward.gems,
  };
}

// === Upgrade purchase ===

export function buyUpgrade(profile: Profile, upgradeId: string, cost: number): Profile {
  if (profile.upgradesOwned.includes(upgradeId)) return profile;
  if (profile.bankCoins < cost) return profile;
  let next: Profile = {
    ...profile,
    bankCoins: profile.bankCoins - cost,
    upgradesOwned: [...profile.upgradesOwned, upgradeId],
  };
  // Daily/weekly/monthly quest progress for buy_stronghold_upgrade.
  next = applyQuestActionToProfile(next, { kind: 'buy_stronghold_upgrade' });
  // Eval achievements that depend on upgrades_owned / bank_coins_at_least.
  const { profile: withAch } = applyAchievementUnlocks(next);
  next = withAch;
  saveProfile(next);
  return next;
}

// Roll an out-of-combat action through all three quest period buckets,
// award quest rewards, and return the updated profile. Used by shop buys,
// card upgrades, stronghold buys, app open, etc. Intentionally cheap — no
// IO; caller is responsible for saveProfile() after composing other
// changes if any.
export function applyQuestActionToProfile(profile: Profile, action: QuestAction): Profile {
  let next = profile;
  // Daily.
  const today = todayKey();
  const dailyState = next.todayQuestsISO === today ? next.todayQuestsState : {};
  const d = applyActionQuestProgress(dailyState, action, questsByPeriod('daily'));
  // Weekly.
  const wKey = weekKey();
  const weekState = next.weekQuestsISO === wKey ? next.weekQuestsState : {};
  const w = applyActionQuestProgress(weekState, action, questsByPeriod('weekly'));
  // Monthly.
  const mKey = monthKey();
  const monthState = next.monthQuestsISO === mKey ? next.monthQuestsState : {};
  const m = applyActionQuestProgress(monthState, action, questsByPeriod('monthly'));

  next = {
    ...next,
    todayQuestsISO: today,
    todayQuestsState: d.state,
    weekQuestsISO: wKey,
    weekQuestsState: w.state,
    monthQuestsISO: mKey,
    monthQuestsState: m.state,
    bankCoins: next.bankCoins + (d.coinsAwarded ?? 0) + (w.coinsAwarded ?? 0) + (m.coinsAwarded ?? 0),
    totalCoinsEarned: next.totalCoinsEarned + (d.coinsAwarded ?? 0) + (w.coinsAwarded ?? 0) + (m.coinsAwarded ?? 0),
    gems: next.gems + d.gemsAwarded + w.gemsAwarded + m.gemsAwarded,
    perkShards: next.perkShards + (d.shardsAwarded ?? 0) + (w.shardsAwarded ?? 0) + (m.shardsAwarded ?? 0),
    bpXp: Math.min(TOTAL_BP_TIERS * XP_PER_TIER, next.bpXp + (d.bpXpAwarded ?? 0) + (w.bpXpAwarded ?? 0) + (m.bpXpAwarded ?? 0)),
  };
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
  const update = applyQuestProgress(p.todayQuestsState, result, questsByPeriod('daily'));
  p.todayQuestsState = update.state;
  p.gems += update.gemsAwarded;
  p.bankCoins += update.coinsAwarded ?? 0;
  p.perkShards += update.shardsAwarded ?? 0;
  p.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, p.bpXp + (update.bpXpAwarded ?? 0));

  // Weekly + monthly buckets.
  const wKey = weekKey();
  if (p.weekQuestsISO !== wKey) {
    p.weekQuestsISO = wKey;
    p.weekQuestsState = {};
  }
  const weekly = applyQuestProgress(p.weekQuestsState, result, questsByPeriod('weekly'));
  p.weekQuestsState = weekly.state;
  p.gems += weekly.gemsAwarded;
  p.bankCoins += weekly.coinsAwarded ?? 0;
  p.perkShards += weekly.shardsAwarded ?? 0;
  p.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, p.bpXp + (weekly.bpXpAwarded ?? 0));

  const mKey = monthKey();
  if (p.monthQuestsISO !== mKey) {
    p.monthQuestsISO = mKey;
    p.monthQuestsState = {};
  }
  const monthly = applyQuestProgress(p.monthQuestsState, result, questsByPeriod('monthly'));
  p.monthQuestsState = monthly.state;
  p.gems += monthly.gemsAwarded;
  p.bankCoins += monthly.coinsAwarded ?? 0;
  p.perkShards += monthly.shardsAwarded ?? 0;
  p.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, p.bpXp + (monthly.bpXpAwarded ?? 0));

  // Phase 6: evaluate achievements against the now-updated profile + this run.
  const newAchievements = evaluateNewlyUnlocked({ profile: p, lastRun: result });
  let achievementXp = 0;
  for (const a of newAchievements) {
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
    questsCompleted: [...update.completedNow, ...weekly.completedNow, ...monthly.completedNow],
    gemsAwarded: update.gemsAwarded + weekly.gemsAwarded + monthly.gemsAwarded,
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
  loreUnlocked: number[];                  // stage numbers of lore milestones newly unlocked this clear
  bpXpAwarded: number;                     // BP XP granted for this clear
  achievementsUnlocked: Array<{
    id: string; rarity: string; name: string; icon: string;
    rewardCoins: number; rewardGems: number;
  }>;
  questsCompleted?: string[];              // BP combat-quest IDs completed by this clear (local mode)
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
  result: {
    cleared: boolean;
    currentHp: number;
    maxHp: number;
    hardcore?: boolean;
    /** Total combos triggered this run. Sigilbound's engine has one combo
     *  type (element_chain); we credit it equally to all three legacy
     *  achievement combo buckets so onslaught/triadic/relentless predicates
     *  can fire from a single combat run. */
    combosTriggered?: number;
    /** Damage dealt per element type this run — used for damage_type quests. */
    damageDealtByType?: Partial<Record<string, number>>;
    /** Total damage taken across the whole stage. 0 → "no-damage clear" used
     *  as proxy for the no_damage_turns quest kind in local mode. */
    damageTakenThisStage?: number;
  },
): { profile: Profile; outcome: CombatClearOutcome } {
  const stars = combatStarsFor({
    cleared: result.cleared,
    currentHp: result.currentHp,
    maxHp: result.maxHp,
  });

  if (stars === 0) {
    return {
      profile,
      outcome: { stars: 0, firstClearAtTier: 0, rewardsGranted: [], itemDrops: [], newCurrentStage: profile.currentStage, loreUnlocked: [], bpXpAwarded: 0, achievementsUnlocked: [] },
    };
  }

  // Clone the profile so we don't mutate the caller's reference.
  let next: Profile = {
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

  // === F1-F4: Retention feature updates ===

  const loreUnlocked: number[] = [];

  // F1 + F2: Boss clear detection. On boss first-clear, unlock hardmode stages and increment prestige.
  if (stage.isBoss && firstClearAtTier > 0) {
    const isBossFirstClear = !profile.bossesDefeatedByStage[stageNum];
    if (isBossFirstClear) {
      // F2: Track first-clear + increment counters.
      next.bossesDefeated = (next.bossesDefeated ?? 0) + 1;
      next.bossesDefeatedByStage = { ...next.bossesDefeatedByStage, [stageNum]: true };
      // Increment card tier cap by 1 (starts 3, max 10).
      next.cardTierCap = cardTierCapForBossCount(next.bossesDefeated);
      // Increment prestige level (cap 20).
      next.enemyPrestigeLevel = Math.min(20, (next.enemyPrestigeLevel ?? 0) + 1);
      // F1: Update hardmode unlock gate.
      next.hardmodeUnlockedThrough = Math.max(next.hardmodeUnlockedThrough, stageNum);
      // F4: Lore unlock on boss first-clear.
      const loreMilestone = getLoreMilestone(stageNum);
      if (loreMilestone && !next.loreMilestonesUnlocked.includes(stageNum)) {
        next.loreMilestonesUnlocked = [...next.loreMilestonesUnlocked, stageNum];
        next.cosmeticsUnlocked = [...next.cosmeticsUnlocked, loreMilestone.rewardCosmetic];
        loreUnlocked.push(stageNum);
      }
    }
  }

  // Lifetime counters that achievements key off. Sigilbound combat used to
  // skip these; without them lifetime_seasons / best_rating predicates never
  // fired.
  next.seasonsPlayed = (next.seasonsPlayed ?? 0) + 1;
  next.lastPlayedISO = new Date().toISOString();
  // Combo counters: credit each legacy combo bucket with this run's combos
  // so the achievements that key off onslaught/triadic/relentless can fire.
  const combos = result.combosTriggered ?? 0;
  if (combos > 0) {
    const cur = next.lifetimeCombos ?? { onslaught: 0, triadic: 0, relentless: 0 };
    next.lifetimeCombos = {
      onslaught: (cur.onslaught ?? 0) + combos,
      triadic: (cur.triadic ?? 0) + combos,
      relentless: (cur.relentless ?? 0) + combos,
    };
  }
  // Map combat star count → rating tier so best_rating predicates trigger.
  // 1★ → bronze, 2★ → silver, 3★ → gold. Hardmode 3★ promotes to mythic.
  const ratingFromStars: Rating =
    stars === 3 ? (result.hardcore ? 'mythic' : 'gold')
    : stars === 2 ? 'silver'
    : stars === 1 ? 'bronze'
    : 'survive';
  if (isBetterRating(ratingFromStars, next.bestRating ?? 'fail')) {
    next.bestRating = ratingFromStars;
  }

  // Award BP XP for the combat clear.
  const combatBpXp = xpFromCombatClear(
    stageNum,
    stars,
    stage.isBoss ?? false,
    result.hardcore ?? false,
  );
  next.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, next.bpXp + combatBpXp);

  // BP combat-quest progression (local mode). Daily/weekly/monthly buckets
  // roll over by date key, then increment damage_type / combo_count /
  // defeat_boss / no_damage_turns kinds from this run's combat data. Cloud
  // mode would normally do this server-side; this path keeps the BP
  // challenges working when offline or when running standalone.
  const damageByType: Record<string, number> = {};
  if (result.damageDealtByType) {
    for (const [k, v] of Object.entries(result.damageDealtByType)) {
      if (typeof v === 'number' && v > 0) damageByType[k] = v;
    }
  }
  const combatRunResult: CombatRunResult = {
    cleared: result.cleared,
    isBoss: stage.isBoss ?? false,
    damageDealtByType: damageByType,
    combosTriggered: result.combosTriggered ?? 0,
    // Per-turn tracking isn't kept; treat a no-damage stage clear as 1 unit
    // of "no_damage_turns" progress so the quest can advance in local play.
    noConsecutiveDamageTurns:
      result.cleared && (result.damageTakenThisStage ?? 0) === 0 ? 1 : 0,
    enemyIdsDefeated: [],
  };

  const today = todayKey();
  if (next.todayQuestsISO !== today) {
    next.todayQuestsISO = today;
    next.todayQuestsState = {};
  }
  const dailyUpdate = applyCombatQuestProgress(
    next.todayQuestsState,
    combatRunResult,
    questsByPeriod('daily'),
  );
  next.todayQuestsState = dailyUpdate.state;
  next.gems += dailyUpdate.gemsAwarded;
  next.bankCoins += dailyUpdate.coinsAwarded ?? 0;
  next.perkShards += dailyUpdate.shardsAwarded ?? 0;
  next.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, next.bpXp + (dailyUpdate.bpXpAwarded ?? 0));

  const wKey = weekKey();
  if (next.weekQuestsISO !== wKey) {
    next.weekQuestsISO = wKey;
    next.weekQuestsState = {};
  }
  const weeklyUpdate = applyCombatQuestProgress(
    next.weekQuestsState,
    combatRunResult,
    questsByPeriod('weekly'),
  );
  next.weekQuestsState = weeklyUpdate.state;
  next.gems += weeklyUpdate.gemsAwarded;
  next.bankCoins += weeklyUpdate.coinsAwarded ?? 0;
  next.perkShards += weeklyUpdate.shardsAwarded ?? 0;
  next.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, next.bpXp + (weeklyUpdate.bpXpAwarded ?? 0));

  const mKey = monthKey();
  if (next.monthQuestsISO !== mKey) {
    next.monthQuestsISO = mKey;
    next.monthQuestsState = {};
  }
  const monthlyUpdate = applyCombatQuestProgress(
    next.monthQuestsState,
    combatRunResult,
    questsByPeriod('monthly'),
  );
  next.monthQuestsState = monthlyUpdate.state;
  next.gems += monthlyUpdate.gemsAwarded;
  next.bankCoins += monthlyUpdate.coinsAwarded ?? 0;
  next.perkShards += monthlyUpdate.shardsAwarded ?? 0;
  next.bpXp = Math.min(TOTAL_BP_TIERS * XP_PER_TIER, next.bpXp + (monthlyUpdate.bpXpAwarded ?? 0));

  const questsCompleted = [
    ...dailyUpdate.completedNow,
    ...weeklyUpdate.completedNow,
    ...monthlyUpdate.completedNow,
  ];

  // Evaluate achievements against the just-updated profile. Coin/gem
  // rewards are folded in here; the unlocked list flows out via the
  // outcome so the result screen can celebrate them.
  const { profile: withAch, unlocked } = applyAchievementUnlocks(next);
  next = withAch;

  saveProfile(next);
  return {
    profile: next,
    outcome: {
      stars,
      firstClearAtTier,
      rewardsGranted,
      itemDrops,
      newCurrentStage: next.currentStage,
      loreUnlocked,
      bpXpAwarded: combatBpXp,
      achievementsUnlocked: unlocked,
      questsCompleted,
    },
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

// === Card pack rolling ===

// Rarity weights: higher rarity = harder to get.
// Rolls 2–4 cards (uniform) from all combat cards (actions + tactics).
const RARITY_WEIGHTS: Record<string, number> = {
  common: 55, uncommon: 27, rare: 12, epic: 5, legendary: 1,
};

export function rollCardPack(packCount: number): string[] {
  const pool = [...allActions(), ...allTactics()];
  // Group by rarity
  const byRarity: Record<string, string[]> = {};
  for (const c of pool) {
    if (!byRarity[c.rarity]) byRarity[c.rarity] = [];
    byRarity[c.rarity].push(c.id);
  }
  // Build weighted flat pool
  const weighted: string[] = [];
  for (const [rarity, ids] of Object.entries(byRarity)) {
    const w = RARITY_WEIGHTS[rarity] ?? 1;
    for (const id of ids) {
      for (let i = 0; i < w; i++) weighted.push(id);
    }
  }

  const result: string[] = [];
  const totalCards = 2 + Math.floor(Math.random() * 3); // 2–4
  const totalDraws = totalCards * packCount;
  for (let i = 0; i < totalDraws; i++) {
    const idx = Math.floor(Math.random() * weighted.length);
    result.push(weighted[idx]);
  }
  return result;
}

// === Battle Pass — local claim + VIP purchase ===

// Claims a single tier reward locally. Used when offline or when cloud is
// unavailable. Returns the updated profile + the granted reward, or null if
// the claim is invalid (tier not reached, already claimed, VIP track without
// VIP, or no reward defined).
export function claimBpTierLocal(
  profile: Profile,
  tier: number,
  track: 'free' | 'premium',
): { profile: Profile; reward: BpRewardItem; rolledCardIds?: string[] } | null {
  if (tier < 1 || tier > TOTAL_BP_TIERS) return null;
  const playerTier = Math.min(TOTAL_BP_TIERS, Math.floor(profile.bpXp / XP_PER_TIER) + 1);
  if (playerTier < tier) return null;
  const tierDef = allBpTiers().find(t => t.tier === tier);
  if (!tierDef) return null;
  const reward = track === 'free' ? tierDef.free : tierDef.premium;
  if (!reward) return null;
  if (track === 'premium' && !profile.bpPremium) return null;
  const claimedList = track === 'free' ? profile.bpClaimedFree : profile.bpClaimedPremium;
  if (claimedList.includes(tier)) return null;

  let next: Profile = { ...profile };
  // Apply the reward.
  switch (reward.type) {
    case 'coins':
      next = { ...next, bankCoins: next.bankCoins + (reward.value as number) };
      break;
    case 'gems':
      next = { ...next, gems: next.gems + (reward.value as number) };
      break;
    case 'shards':
      next = { ...next, perkShards: next.perkShards + (reward.value as number) };
      break;
    case 'combat_card_copies': {
      // intentionally handled after the switch — needs rolledCardIds
      break;
    }
    case 'talent_charge': {
      // Stand-in: convert into shards so charges stay valuable. Cloud-side
      // implementation will grant a tracked charge instead.
      next = { ...next, perkShards: next.perkShards + (reward.value as number) * 100 };
      break;
    }
    case 'cosmetic': {
      const id = reward.value as string;
      if (!next.cosmeticsUnlocked.includes(id)) {
        next = { ...next, cosmeticsUnlocked: [...next.cosmeticsUnlocked, id] };
      }
      break;
    }
    case 'perk': {
      next = addPerkCharges(next, reward.value as string, 1);
      break;
    }
  }

  // Roll card pack after switch so we can return the card IDs.
  let rolledCardIds: string[] | undefined;
  if (reward.type === 'combat_card_copies') {
    rolledCardIds = rollCardPack(reward.value as number);
    const inv = { ...next.combatCardInventory };
    for (const id of rolledCardIds) {
      inv[id] = (inv[id] ?? 0) + 1;
    }
    next = { ...next, combatCardInventory: inv };
  }

  // Mark claimed.
  if (track === 'free') {
    next = { ...next, bpClaimedFree: [...next.bpClaimedFree, tier] };
  } else {
    next = { ...next, bpClaimedPremium: [...next.bpClaimedPremium, tier] };
  }
  // Eval — bank coins / bp_tier-adjacent achievements may now satisfy.
  const { profile: withAch } = applyAchievementUnlocks(next);
  next = withAch;
  saveProfile(next);
  return { profile: next, reward, rolledCardIds };
}

// Buy the VIP (premium) pass locally with gems. Returns null if the player
// can't afford or the pass is already owned.
export function buyVipPassLocal(profile: Profile): Profile | null {
  if (profile.bpPremium) return null;
  if (profile.gems < VIP_PASS_GEM_COST) return null;
  let next: Profile = { ...profile, gems: profile.gems - VIP_PASS_GEM_COST, bpPremium: true };
  // bp_premium predicate trips immediately.
  const { profile: withAch } = applyAchievementUnlocks(next);
  next = withAch;
  saveProfile(next);
  return next;
}

// Claim a daily/weekly/monthly challenge reward locally. The progress is
// already tracked in *QuestsState; this just marks the quest as claimed and
// pays out coins/gems/shards/BP-XP. Returns null if the quest doesn't exist,
// isn't complete, or has already been claimed.
export function claimQuestRewardLocal(
  profile: Profile,
  questId: string,
): { profile: Profile; coins: number; gems: number; shards: number; bpXp: number } | null {
  // Find the quest and which state bucket it belongs to.
  const allQuests = questsJson as Array<{
    id: string; period: 'daily' | 'weekly' | 'monthly'; goal: number;
    rewardCoins: number; rewardGems: number; rewardShards: number; rewardBpXp: number;
  }>;
  const q = allQuests.find(x => x.id === questId);
  if (!q) return null;
  const bucket: 'todayQuestsState' | 'weekQuestsState' | 'monthQuestsState' =
    q.period === 'daily' ? 'todayQuestsState' :
    q.period === 'weekly' ? 'weekQuestsState' : 'monthQuestsState';
  const state = profile[bucket] ?? {};
  const cur = state[questId];
  if (!cur || cur.progress < q.goal || cur.claimed) return null;

  const nextState = { ...state, [questId]: { progress: cur.progress, claimed: true } };
  let next: Profile = {
    ...profile,
    [bucket]: nextState,
    bankCoins: profile.bankCoins + q.rewardCoins,
    totalCoinsEarned: profile.totalCoinsEarned + q.rewardCoins,
    gems: profile.gems + q.rewardGems,
    perkShards: profile.perkShards + q.rewardShards,
    bpXp: Math.min(TOTAL_BP_TIERS * XP_PER_TIER, profile.bpXp + q.rewardBpXp),
  };
  // Eval — lifetime_coins, bank_coins_at_least, bp_tier may now satisfy.
  const { profile: withAch } = applyAchievementUnlocks(next);
  next = withAch;
  saveProfile(next);
  return {
    profile: next,
    coins: q.rewardCoins,
    gems: q.rewardGems,
    shards: q.rewardShards,
    bpXp: q.rewardBpXp,
  };
}
