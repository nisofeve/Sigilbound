import type { Grade } from './grades';
import type { OrderState } from './orders';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type CropType =
  | 'carrot' | 'lettuce' | 'radish' | 'corn' | 'bean' | 'pea'
  | 'tomato' | 'pepper' | 'pumpkin' | 'melon' | 'wheat' | 'eggplant'
  | 'berry' | 'grape' | 'mushroom' | 'cabbage'
  | 'sunflower' | 'truffle' | 'titanflower' | 'phoenix';

export type CardId = string;

export interface SeedCard {
  id: CardId;
  type: 'seed';
  name: string;
  crop: CropType;
  rarity: Rarity;
  growRounds: number;
  sellPrice: number;
  effect?: string;
  emoji: string;
}

export interface ToolCard {
  id: CardId;
  type: 'tool';
  name: string;
  rarity: Rarity;
  persistent: boolean;
  effect: string;
  emoji: string;
}

export type Card = SeedCard | ToolCard;

export interface PlantedCrop {
  cardId: CardId;
  crop: CropType;
  growRoundsRemaining: number;
  // sellPrice already includes the grade multiplier — engine never re-applies
  // it. Keep base sellPrice on the SeedCard definition; grade is applied at
  // plant time so undo refunds the same priced instance.
  sellPrice: number;
  grade: Grade;
}

export type PlotState =
  | { kind: 'empty' }
  | { kind: 'growing'; crop: PlantedCrop }
  | { kind: 'ready'; crop: PlantedCrop };

// === Phase 2 — Perks ===

export type PerkKind = 'passive' | 'combo_mod' | 'goal' | 'defensive';

// Tagged union of perk effects. The engine pattern-matches on `type`.
// Unknown types are treated as no-ops so unimplemented perks degrade gracefully.
export type PerkModifier =
  | { type: 'starting_coins'; value: number }
  | { type: 'round_one_extra_draw'; value: number }
  | { type: 'hand_size_delta'; value: number }
  | { type: 'plot_count_delta'; value: number }
  | { type: 'global_sale_mult'; value: number }
  | { type: 'onslaught_tier_bump'; value: number }            // Sigilbound: Onslaught Amplifier (Plotbound: Abundance Amplifier)
  | { type: 'relentless_cap_delta'; value: number }           // Sigilbound: Loyalty Pact (Plotbound: Loyal cap)
  | { type: 'combo_cascade_draw'; value: number }
  | { type: 'triadic_threshold_delta'; value: number }        // Sigilbound: Triadic Pack — fires at 2 types instead of 3
  | { type: 'first_seed_grow_delta'; value: number }        // Sustained Growth: -1 grow on first seed/round
  | { type: 'tool_draw_bonus'; value: number; cap: number } // Tool Master: +1 draw per tool, cap 6/season
  | { type: 'watering_can_free_uses'; value: number }       // Watering Pro: 3 free Watering Cans
  | { type: 'forced_boon_count'; value: number }            // Lucky Streak: first N events forced to boons
  | { type: 'goal_harvest_crop'; crop: CropType; goal: number; reward: number } // Carrot Specialist
  | { type: 'goal_plant_crop'; crop: CropType; goal: number; reward: number }   // Corn Field Bonus
  // Sigilbound-only talent modifiers. Phase 5 wires these into BattleRunner;
  // until then they're carried in PerkModifier so JSON validates and the
  // talent loadout UI can read names/icons even before effects run.
  | { type: 'first_action_damage_bonus'; pct: number }                          // Battlecry
  | { type: 'max_hp_bonus'; value: number }                                      // Vigorous (also stage-start heal)
  | { type: 'stage_start_heal'; value: number }
  | { type: 'turn_one_extra_draw'; value: number }                               // Quick Draw (combat parallel of round_one_extra_draw)
  | { type: 'damage_type_bonus'; damageType: 'steel' | 'pierce' | 'pyre' | 'frost' | 'arcane'; pct: number } // Steel/Pyre Specialist
  | { type: 'tactic_stamina_discount'; value: number }                           // Tactician's Mark
  | { type: 'block_carry_cap'; value: number }                                   // Iron Discipline
  | { type: 'sigil_slots_delta'; value: number }                                 // Extra Sigil
  | { type: 'clean_turn_heal'; value: number }                                   // Swift Recovery
  | { type: 'gold_drop_bonus'; pct: number }                                     // Warrior's Fortune
  | { type: 'speed_bonus'; pct: number }                                         // Quick Reflexes
  | { type: 'tactic_effect_bonus'; pct: number }                                 // Tactic Master
  | { type: 'auto_block_low_hp'; threshold: number; block: number; oncePerStage: boolean } // Aegis
  | { type: 'combo_stamina_refund'; value: number }                              // Combo Cascade (Sigilbound version)
  | { type: 'triadic_damage_bonus'; pct: number }                                // Triple Threat
  | { type: 'crit_chance_bonus'; pct: number }                                   // Lucky Streak
  | { type: 'crit_heal'; value: number }                                         // Lucky Streak (paired)
  | { type: 'all_combo_damage_mult'; mult: number }                              // Sigilbound Master
  | { type: 'card_replicate_chance'; pct: number }                               // Astral Convergence
  | { type: 'hand_cap_delta'; value: number }                                    // Spacious Mind
  | { type: 'noop' };

export interface Perk {
  id: string;
  name: string;
  rarity: Rarity;
  kind: PerkKind;
  icon: string;
  description: string;
  modifier: PerkModifier;
}

// === Phase 2 — Event cards ===

export type EventKind = 'boon' | 'hazard' | 'special';

export type EventEffect =
  | { type: 'advance_all_seeds'; value: number }
  | { type: 'round_sale_mult'; value: number }
  | { type: 'free_coins'; value: number }
  | { type: 'random_seed_setback'; value: number }
  | { type: 'pay_coins'; value: number }
  | { type: 'no_growth_this_round' };

export interface EventCard {
  id: string;
  kind: EventKind;
  name: string;
  icon: string;
  description: string;
  effect: EventEffect;
}

// === Phase 2 — Upgrades ===

export type UpgradeZone = 'armory' | 'sanctum' | 'library' | 'forge' | 'shrine'
  // Legacy zones kept for backward compat with old save data.
  | 'land' | 'barn' | 'greenhouse' | 'market';

export type UpgradeEffect =
  // Legacy effects
  | { type: 'plot_count_delta'; value: number }
  | { type: 'starting_deck_extra'; value: number }
  | { type: 'starting_deck_extra_card'; cardId: CardId; value: number }
  | { type: 'first_seed_grow_delta'; value: number }
  | { type: 'starting_coins'; value: number }
  | { type: 'global_sale_mult'; value: number }
  // Active effects
  | { type: 'hand_size_delta'; value: number }
  | { type: 'draft_count_delta'; value: number }
  | { type: 'perk_slots_delta'; value: number }
  | { type: 'sigil_slots_delta'; value: number }
  | { type: 'atk_bonus'; value: number }
  | { type: 'def_bonus'; value: number }
  | { type: 'max_hp_bonus'; value: number }
  | { type: 'stamina_bonus'; value: number }
  | { type: 'speed_bonus'; value: number }
  | { type: 'crit_chance_bonus'; value: number }
  | { type: 'crit_damage_bonus'; value: number }
  | { type: 'first_action_damage_bonus'; value: number }
  | { type: 'all_combo_damage_mult'; mult: number }
  | { type: 'combo_damage_bonus'; value: number }
  | { type: 'combo_stamina_refund'; value: number }
  | { type: 'card_replicate_chance'; value: number }
  | { type: 'tactic_stamina_discount'; value: number }
  | { type: 'turn_one_extra_draw'; value: number }
  | { type: 'starting_block'; value: number }
  | { type: 'regen_per_turn'; value: number }
  | { type: 'block_carry_cap'; value: number }
  | { type: 'on_kill_heal'; value: number }
  | { type: 'stage_start_heal'; value: number }
  | { type: 'on_lethal_survive'; value: number }
  | { type: 'auto_block_low_hp'; threshold: number; block: number }
  | { type: 'global_block_piercing'; value: number }
  | { type: 'gold_drop_bonus'; value: number }
  | { type: 'craft_discount'; value: number }
  | { type: 'unlock_upgrade_tier'; value: number }
  | { type: 'reaction_slots_delta'; value: number }
  | { type: 'free_reroll_per_run'; value: number }
  | { type: 'resistance_bonus'; element: string; value: number }
  | { type: 'all_resist_bonus'; value: number }
  | { type: 'damage_type_bonus'; element: string; value: number }
  | { type: 'heal_effectiveness_mult'; value: number }
  | { type: 'noop' };

export interface Upgrade {
  id: string;
  zone: UpgradeZone;
  tier: number;
  name: string;
  description: string;
  cost: number;
  prerequisite: string | null;
  effect: UpgradeEffect;
}

// === Run state (extended in Phase 2) ===

export interface PersistentToolState {
  // Tool effects that persist across rounds during a run.
  hazardShields: number;             // Scarecrow
  tempPlotsRemaining: number;        // Silver Hoe (rounds left)
  compostBonusPerHarvest: number;    // Compost Heap
  dripLineActive: boolean;           // Drip Line (active rounds 4-8)
  rainbowSprinklerActive: boolean;   // Rainbow Sprinkler (permanent)
}

export interface RunState {
  seed: number;
  round: number;        // 1-indexed; 1..totalRounds
  totalRounds: number;
  coins: number;
  hand: CardId[];
  deck: CardId[];       // top of deck = index 0
  discard: CardId[];
  // Parallel arrays of grades, kept in lock-step with hand/deck/discard. A
  // tool card always has grade 'F' (grades only matter for seeds, but storing
  // a grade on every card avoids per-call type checks). When a card moves
  // between zones the grade moves with it.
  handGrades: Grade[];
  deckGrades: Grade[];
  discardGrades: Grade[];
  plots: PlotState[];
  relentlessStreak: number;
  relentlessCrop: CropType | null;
  // One-shot buff applied to the next planted seed (e.g., Fertilizer Bag).
  nextSeedGrowDelta: number;
  // One-shot multiplier applied to the next harvested crop (e.g., Golden Trowel).
  nextSaleMultBonus: number;
  // Pending extra draws to apply at the next refill (Combo Cascade).
  pendingNextRoundDraws: number;
  combosTotal: { onslaught: number; triadic: number; relentless: number };
  perks: Perk[];        // Equipped perks for this run.
  toolState: PersistentToolState;
  // Plot indices planted during the current round — eligible for undo until end_round.
  plantedThisRound: number[];
  // Phase 7: per-run counters used by goal-tracking perks + modifier perks
  // that need state across rounds.
  cropsHarvestedByType: Partial<Record<CropType, number>>;
  cropsPlantedByType: Partial<Record<CropType, number>>;
  toolDrawBonusUsed: number;        // Tool Master cap tracker.
  wateringCanFreeUses: number;      // Watering Pro counter (decrements per use).
  firstSeedThisRoundUsed: boolean;  // Sustained Growth: only first plant per round gets the bonus.
  forcedBoonsRemaining: number;     // Lucky Streak: forces next N events to boons.
  perkGoalRewards: number;          // Accumulated reward from completed goals (added at season end).

  // Phase 9 — Order system. 2-3 cards drawn at run start that pay big
  // bonus coins when fulfilled and split harvest payout: matched crops
  // pay full price, unmatched pay half. Empty array = no orders this run.
  orders: OrderState[];
}

export interface HarvestResult {
  crop: CropType;
  basePrice: number;
  onslaughtMult: number;
  relentlessMult: number;
  finalPrice: number;
}

export interface RoundResult {
  round: number;
  harvests: HarvestResult[];
  triadicBonus: number;
  totalCoinsThisRound: number;
  relentlessStreakAfter: number;
  combosTriggered: { onslaught: boolean; triadic: boolean; relentless: boolean };
}

// === Phase 2 — Run state machine ===

export type RunPhase = 'play' | 'draft' | 'season_end';

export type RunAction =
  | { kind: 'play_seed'; handIndex: number; plotIndex: number }
  | { kind: 'play_tool'; handIndex: number; targetPlotIndex?: number }
  | { kind: 'undo_plant'; plotIndex: number }
  | { kind: 'end_round' }
  | { kind: 'draft_pick'; cardId: CardId }
  | { kind: 'draft_skip' }
  | { kind: 'discard_cards'; handIndices: number[] };

// Engine emits these so the scene can sequence animations.
// "RunEvent" is unrelated to the in-game Event Cards (those are EventCard).
export type RunEvent =
  | { kind: 'card_drawn'; cardId: CardId; handIndex: number; grade?: Grade }
  | { kind: 'deck_reshuffled' }
  | { kind: 'seed_planted'; cardId: CardId; plotIndex: number; grade?: Grade }
  | { kind: 'plant_undone'; cardId: CardId; plotIndex: number; grade?: Grade }
  | { kind: 'tool_used'; cardId: CardId; targetPlotIndex?: number }
  | { kind: 'cards_discarded'; cardIds: CardId[]; grades?: Grade[] }
  | { kind: 'crop_grew'; plotIndex: number; remaining: number }
  | { kind: 'crop_ready'; plotIndex: number }
  | { kind: 'crop_harvested'; plotIndex: number; cardId: CardId; finalPrice: number; onslaughtMult: number; relentlessMult: number }
  | { kind: 'combo_triggered'; combo: 'onslaught' | 'triadic' | 'relentless' }
  | { kind: 'event_triggered'; event: EventCard; round: number }
  | { kind: 'event_resolved'; event: EventCard; coinsDelta: number }
  | { kind: 'draft_offered'; cards: CardId[] }
  | { kind: 'draft_resolved'; cardId: CardId | null }
  | { kind: 'round_resolved'; result: RoundResult }
  | { kind: 'round_started'; round: number }
  | { kind: 'season_ended'; result: RunResult }
  // Order progress changed (counter ticked or fulfilled flag flipped). The
  // scene uses these events to play "fly" SFX/VFX when a crop or watering
  // hit advances an order, and to bounce the order card on fulfillment.
  | { kind: 'order_progress'; orderId: string; progress: number; goal: number; fulfilledNow: boolean }
  | { kind: 'order_fulfilled'; orderId: string; reward: number };

export type Rating = 'fail' | 'survive' | 'bronze' | 'silver' | 'gold' | 'mythic';

// Compact summary of an order at season end — what the results screen shows
// in its "Orders" section. Detached from the live OrderState so the result
// can survive serialization.
export interface OrderSummary {
  id: string;
  title: string;
  description: string;
  icon: string;
  difficulty: 1 | 2 | 3;
  reward: number;
  progress: number;
  goal: number;
  fulfilled: boolean;
}

export interface RunResult {
  finalCoins: number;
  rounds: number;
  combosTotal: { onslaught: number; triadic: number; relentless: number };
  rating: Rating;
  // Snapshot of the player's orders at season end. Empty when orders were
  // disabled (test runs / market-bell early end without orders).
  orders: OrderSummary[];
  // Stage number this run was played against (1..N). Undefined for free-play
  // runs (random orders) and tests. The result screen uses this to show
  // stars + stage-clear rewards.
  stageNumber?: number;
}

export interface SeasonConfig {
  seed: number;
  totalRounds: number;
  startingHandSize: number;
  startingPlotCount: number;
  startingDeck: CardId[];
  // Parallel grade array for the starting deck. If absent, every card defaults
  // to grade 'F'. Same length as startingDeck.
  startingDeckGrades?: Grade[];
  startingCoins: number;       // Seeded by upgrades + Early Bird perk.
  draftRounds: number[];       // Rounds after which draft fires (e.g., [3, 6, 9]).
  draftCardCount: number;      // How many cards to offer (default 3, +1 with Draft+1 upgrade).
  perks: Perk[];               // Equipped perks for this run.
  ownedUpgradeIdsForRun?: string[]; // For mid-run upgrade-effect lookups (Greenhouse first-seed, etc.).
  // Restricts the draft pool to cards the player actually owns. When empty
  // or undefined the runner falls back to the full card library — this keeps
  // tests + bare callers working without rewriting their setup.
  ownedCardIdsForRun?: CardId[];
  // Player-chosen orders for the run. When set, the runner uses these
  // directly. When undefined, the runner rolls its own 3 (existing behavior
  // for tests + the Market Bell early-end path).
  chosenOrdersForRun?: import('./orders').OrderCard[];
  disableOrders?: boolean;     // Test-only: skip order generation + half-price split.
  // Stage number this run is being played against (1..N). Forwarded into
  // RunResult so the post-run flow can grant stage-clear rewards. Free-play
  // runs (random orders, no stage curve) leave this undefined.
  stageNumber?: number;
}

// === Phase 6 — Achievements ===

export type AchievementCategory =
  | 'beginner' | 'harvest' | 'combo_master' | 'tycoon' | 'veteran'
  | 'deck_builder' | 'social' | 'mythic' | 'tool_wizard' | 'farmstead';

// Tagged union of predicate types that can be evaluated against current profile +
// an optional "last run" snapshot. Adding a new predicate type means extending
// `predicateMet()` in engine/achievements.ts and the cloud-side mirror.
export type AchievementPredicate =
  | { type: 'lifetime_seasons'; min: number }
  | { type: 'lifetime_coins'; min: number }
  | { type: 'single_run_coins'; min: number }
  | { type: 'lifetime_combo'; combo: 'onslaught' | 'triadic' | 'relentless'; min: number }
  | { type: 'triple_combo_in_run' }
  | { type: 'best_rating'; min: Rating }
  | { type: 'pvp_wins'; min: number }
  | { type: 'friends_count'; min: number }
  | { type: 'upgrades_owned'; min: number }
  | { type: 'perks_owned'; min: number }
  | { type: 'bp_tier'; min: number }
  | { type: 'bp_premium' }
  | { type: 'bank_coins_at_least'; min: number };

export interface Achievement {
  id: string;
  category: AchievementCategory;
  rarity: Rarity;
  name: string;
  description: string;
  icon: string;
  predicate: AchievementPredicate;
}

// Per-rarity reward block (matches GDD §Achievements distribution table).
export const ACHIEVEMENT_REWARDS: Record<Rarity, { coins: number; gems: number }> = {
  common:    { coins: 10,  gems: 1 },
  uncommon:  { coins: 25,  gems: 3 },
  rare:      { coins: 50,  gems: 8 },
  epic:      { coins: 100, gems: 15 },
  legendary: { coins: 250, gems: 30 },
  mythic:    { coins: 500, gems: 75 },
};
