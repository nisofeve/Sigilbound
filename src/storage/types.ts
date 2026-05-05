// Pure type definitions for everything the storage layer persists or returns.
// No runtime code — keeps the type surface small enough to import freely
// without dragging in localStorage / engine logic.

import type { CardId, Grade, Rating, StageReward } from '@engine/index';

// === Profile shape ===

export interface Profile {
  // Lifetime stats.
  totalCoinsEarned: number;
  seasonsPlayed: number;
  bestScore: number;
  bestRating: Rating;
  lifetimeCombos: { onslaught: number; triadic: number; relentless: number };
  lastPlayedISO: string | null;

  // Phase 2: meta-progression.
  bankCoins: number;          // Spendable on upgrades. Filled from end-of-season finalCoins.
  upgradesOwned: string[];    // Upgrade IDs the player has bought.
  // Legacy: list of perk IDs ever-unlocked. Kept for back-compat with cloud
  // sync + achievements — starter perks always live here. Consumable
  // ownership is tracked in perksInventory below.
  perksOwned: string[];
  // Phase 9: consumable perks. perksInventory[perkId] = number of charges
  // remaining. Each run consumes one charge per equipped perk (except the
  // starter perks which never decrement). Missing entry = 0.
  perksInventory: Record<string, number>;
  perksEquipped: string[];    // Perks equipped for the next run (max varies with upgrades).

  // Phase 3: cloud-aware additions.
  gems: number;
  todayQuestsISO: string | null;          // YYYY-MM-DD; resets daily.
  todayQuestsState: Record<string, { progress: number; claimed: boolean }>;
  // Battle Pass weekly + monthly challenge state. Each carries its own period
  // key (ISO week "YYYY-WNN" / month "YYYY-MM"). When the key advances, the
  // state object is wiped and the next period's quests are seeded.
  weekQuestsISO: string | null;
  weekQuestsState: Record<string, { progress: number; claimed: boolean }>;
  monthQuestsISO: string | null;
  monthQuestsState: Record<string, { progress: number; claimed: boolean }>;

  // Phase 4: social + PvP.
  farmCode: string | null;                // 6-char shareable code (assigned cloud-side).
  displayName: string | null;
  hr: number;                             // Harvest Rating (PvP).
  pvpWins: number;
  pvpLosses: number;
  pvpDraws: number;
  friends: string[];                      // uids of mutual friends.

  // Phase 5: monetization scaffold.
  bpXp: number;                           // Total XP toward current Battle Pass.
  bpPremium: boolean;                     // Has the player bought the premium track?
  bpClaimedFree: number[];                // Tier indices already claimed (free track).
  bpClaimedPremium: number[];             // Tier indices already claimed (premium track).
  perkShards: number;                     // Crafting currency.
  rejectedRunCount: number;               // Anti-cheat: runs the cloud rejected.

  // Phase 6: achievements.
  achievementsUnlocked: string[];         // IDs that have been earned (predicate satisfied).
  achievementsClaimed: string[];          // IDs whose reward has been manually collected.

  // Phase 7: tutorial / onboarding.
  tutorialSeen: boolean;                  // Welcome modal dismissed at least once.

  // Phase 9: player profile + level system.
  playerXp: number;                       // Total XP toward player level.
  claimedLevels: number[];                // Level numbers whose reward has been claimed.
  avatarEmoji: string;                    // Profile picture (emoji-only for now — easy to render anywhere).

  // Stage progression. `currentStage` is the highest stage the player has
  // unlocked — they can replay any stage <= currentStage. Cleared stages map
  // to their best star count in `stageStars`. Beating a stage with at least
  // 1 star bumps `currentStage` to max(currentStage, stage+1). First-clear
  // rewards are paid only the first time a stage is cleared at a star tier
  // higher than any previous attempt — `stageRewardsClaimed` tracks the
  // highest star tier whose first-clear chest was paid out for each stage.
  currentStage: number;
  stageStars: Record<number, 1 | 2 | 3>;
  stageRewardsClaimed: Record<number, 1 | 2 | 3>;

  // Phase 8: card grades + deck management.
  // Player-owned cards. cardInventory[cardId][grade] = count of copies owned.
  // Owning a card at grade G doesn't imply ownership of the same card at any
  // other grade — upgrades sacrifice copies of the same id+grade.
  cardInventory: Record<CardId, Partial<Record<Grade, number>>>;
  // 5 saved deck loadouts. Each entry is a list of card-instances (id+grade)
  // that the player has chosen to bring into a run.
  deckPresets: DeckPreset[];
  activeDeckPreset: number;               // 0..4
  // Daily shop card section: deterministic 6-card roll per UTC day.
  dailyShopISO: string | null;
  dailyShopBoughtIds: string[];           // ids the player has already bought today (one per day)
  // Number of times the player has manually rerolled each daily-shop tab
  // today. Each reroll bumps the counter, salts a new shop seed, and
  // charges an escalating fee (see rerollCoinCostFor / rerollGemCostFor).
  // Both reset when the daily UTC rollover fires.
  dailyShopRerolls: number;
  dailyPerkShopRerolls: number;

  // === Phase 7 — Sigilbound combat collection + deck ===
  // Card collection for combat. Maps Action/Tactic card id → count of
  // copies owned. No grade dimension in v1 — every copy is identical.
  combatCardInventory: Record<string, number>;
  // Card tier levels. Unmapped implies tier 1.
  combatCardTiers: Record<string, number>;
  // Player-built combat deck. Ordered list of card ids (duplicates allowed).
  // Empty array → BattleRunner falls back to the gear-only auto-deck.
  // Kept as the ACTIVE deck mirror — always equals combatDeckSets[activeCombatDeckSet].cards.
  combatDeck: string[];
  // 7 named deck presets. Index 0..6. Each has a name + card list.
  combatDeckSets: CombatDeckSet[];
  // Which of the 7 sets is currently active (0-based).
  activeCombatDeckSet: number;
  // Sigilbound daily shop. Separate from the legacy Plotbound shop fields
  // because the combat shop uses crystals/soul-shards rather than coins/gems
  // and rotates daily-rolled Action/Tactic cards instead of seeds/tools.
  combatShopISO: string | null;
  combatShopBoughtIds: string[];          // legacy: used before copies existed
  combatShopBoughtCounts: Record<string, number>; // tracks copies purchased per cardId
  combatShopRerolls: number;

  // === Retention Features (F1–F6) ===
  // F1: Hardmode Stages
  hardmodeUnlockedThrough: number;        // highest boss stage beaten on normal (stages 1..N unlock in hard)
  hardmodeStageStars: Record<number, 1 | 2 | 3>;
  hardmodeRewardsClaimed: Record<number, 1 | 2 | 3>;

  // F2: Boss-Gated Upgrade Progression
  bossesDefeated: number;                 // lifetime first-clears of boss stages
  bossesDefeatedByStage: Record<number, boolean>;
  cardTierCap: number;                    // starts 3, +1 per new boss, max 10
  enemyPrestigeLevel: number;             // +3% per boss to enemy stats, cap 20

  // F3: Leaderboard (local-only for now)
  allTimeHighScore: number;
  weeklyHighScore: number;
  weeklyScoreISO: string | null;          // ISO week key "YYYY-WNN"

  // F4: Lore Unlocks
  loreMilestonesUnlocked: number[];       // stage numbers of unlocked boss milestones
  cosmeticsUnlocked: string[];            // cosmetic ids the player owns
  activeCardBack: string | null;          // active card back cosmetic id

  // F6: Battle Pass Season Cycle
  bpSeasonISO: string | null;             // season start date (YYYY-MM-DD)
  bpSeasonNumber: number;                 // which season (1, 2, 3...)
}

export interface CombatDeckSet {
  name: string;           // Player-chosen name, e.g. "Aggro Build"
  cards: string[];        // Ordered card ids (duplicates allowed), 0–30
}

export const MAX_COMBAT_DECK_SETS = 7;

export interface DeckEntry {
  cardId: CardId;
  grade: Grade;
  count: number;                          // copies of this id+grade in this preset
}

export interface DeckPreset {
  name: string;
  entries: DeckEntry[];
}

// === Run outcome ===

export interface StageRunOutcome {
  // Stage played, stars earned, whether the stage was first-cleared at this
  // tier, and the rewards actually granted (first-clear chest OR replay
  // currency). Used by ResultsScreen to show the stage banner + chest.
  stageNumber: number;
  stars: 0 | 1 | 2 | 3;
  firstClearAtTier: 0 | 1 | 2 | 3;     // 0 if no first-clear paid this run
  rewardsGranted: StageReward[];
}

export interface RecordRunOutcome {
  profile: Profile;
  questsCompleted: string[];
  gemsAwarded: number;
  achievementsUnlocked: string[];
  stageOutcome: StageRunOutcome | null;
}

// === Daily shop options (passed to buyDailyCard / buyDailyPerk) ===

export interface BuyDailyOptions {
  entryId: string;
  cardId: CardId;
  payWith: 'coins' | 'gems';
  coinPrice: number;
  gemPrice: number;
}

export interface BuyDailyPerkOptions {
  entryId: string;
  perkId: string;
  payWith: 'coins' | 'gems';
  coinPrice: number | null; // null = coin payment not available for this rarity
  gemPrice: number;
}

// === Constants exported for cross-file consumers ===

// localStorage key. v3 reflects the current Profile shape — bumping this is
// the migration knob if the shape ever changes incompatibly.
export const STORAGE_KEY = 'plotbound:profile:v3';

// Phase 2: Sigilbound permanent starting talents.
// These never consume charges when equipped.
export const STARTER_PERKS = ['talent.battlecry', 'talent.vigorous'];

// Mirror of the engine's DEFAULT_STARTER_DECK so a new account starts with
// a playable deck preset + matching inventory. Kept in sync manually —
// these IDs are stable.
export const STARTER_DECK_IDS: CardId[] = [
  'seed.humble_carrot', 'seed.humble_carrot', 'seed.humble_carrot', 'seed.humble_carrot',
  'seed.golden_corn', 'seed.golden_corn', 'seed.golden_corn',
  'seed.lettuce_leaf', 'seed.lettuce_leaf',
  'tool.watering_can', 'tool.watering_can',
  'tool.fertilizer_bag',
];
