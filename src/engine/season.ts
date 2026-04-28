import { allSeeds, allTools, getCard } from './cards';
import { resolveHarvests } from './combos';
import { gradedSellPrice, type Grade } from './grades';
import { orderAcceptsCrop, rollOrdersForRun, type OrderCard, type OrderObjective } from './orders';
import { rollEventForRound } from './events';
import { findModifier, sumModifier } from './perks';
import { allUpgrades, sumUpgradeEffect } from './upgrades';
import { createRng, type Rng } from './rng';
import type {
  CardId,
  CropType,
  EventCard,
  Perk,
  PersistentToolState,
  PlotState,
  Rating,
  RunAction,
  RunEvent,
  RunPhase,
  RunResult,
  RunState,
  SeasonConfig,
  SeedCard,
  ToolCard,
} from './types';

// === Defaults ===

export const DEFAULT_STARTER_DECK: CardId[] = [
  'seed.humble_carrot', 'seed.humble_carrot', 'seed.humble_carrot', 'seed.humble_carrot',
  'seed.golden_corn', 'seed.golden_corn', 'seed.golden_corn',
  'seed.lettuce_leaf', 'seed.lettuce_leaf',
  'tool.watering_can', 'tool.watering_can',
  'tool.fertilizer_bag',
];

export interface SeasonConfigOverrides {
  perks?: Perk[];
  ownedUpgradeIds?: string[];
  // Player-managed deck. If provided, replaces the default starter deck
  // entirely. Per-card-extras from upgrades (Auto-Irrigation, Hybrid Lab) and
  // the global starting_deck_extra count still apply on top, so a player who
  // owns those upgrades benefits from them no matter which preset they bring.
  customDeck?: CardId[];
  customDeckGrades?: Grade[];
  // Cards the player owns at any grade. When set + non-empty, the draft pool
  // is restricted to these IDs so the player only sees cards they have access
  // to. Fallback (undefined / empty) preserves the original behaviour for
  // tests and bare callers — pool is the full data file.
  ownedCardIds?: CardId[];
  // Pre-chosen orders for the run — used after the player picks their 3 from
  // the 5-card offer. When provided, the runner skips its own roll and uses
  // these directly. Length is whatever the picker committed (intended: 3).
  chosenOrders?: OrderCard[];
  // Tests opt out of orders so harvest math stays purely combo-driven and
  // assertions don't depend on which order types the rng happened to roll.
  disableOrders?: boolean;
  // Stage being played, if any. The stage's fixed orders should be supplied
  // via `chosenOrders` — this number is forwarded into the SeasonConfig so
  // RunResult can carry it through to the post-run flow.
  stageNumber?: number;
}

export function defaultSeasonConfig(seed: number, overrides: SeasonConfigOverrides = {}): SeasonConfig {
  const perks = overrides.perks ?? [];
  const upgrades = overrides.ownedUpgradeIds ?? [];

  const baseHand = 5;
  const basePlots = 3;
  const baseDeckExtras = 0;
  const baseDraft = 3;

  const handSize = baseHand
    + sumModifier(perks, 'hand_size_delta')
    + sumUpgradeEffect(upgrades, 'hand_size_delta');
  const plotCount = basePlots
    + sumModifier(perks, 'plot_count_delta')
    + sumUpgradeEffect(upgrades, 'plot_count_delta');
  const startingCoins = sumModifier(perks, 'starting_coins')
    + sumUpgradeEffect(upgrades, 'starting_coins');
  const draftCount = baseDraft + sumUpgradeEffect(upgrades, 'draft_count_delta');

  const deckExtra = baseDeckExtras + sumUpgradeEffect(upgrades, 'starting_deck_extra');
  // Custom deck (from player's deck preset) replaces the static starter deck.
  // Falls back to DEFAULT_STARTER_DECK so no-deck-preset and tests still work.
  const baseDeck: CardId[] = overrides.customDeck && overrides.customDeck.length > 0
    ? overrides.customDeck.slice()
    : [...DEFAULT_STARTER_DECK];
  const baseGrades: Grade[] = overrides.customDeckGrades && overrides.customDeckGrades.length === baseDeck.length
    ? overrides.customDeckGrades.slice()
    : baseDeck.map(() => 'F' as Grade);

  // Deck extras: simply duplicate carrots for now (cheap content boost).
  const startingDeck: CardId[] = [
    ...baseDeck,
    ...Array.from({ length: deckExtra }, () => 'seed.humble_carrot' as CardId),
  ];
  const startingDeckGrades: Grade[] = [
    ...baseGrades,
    ...Array.from({ length: deckExtra }, () => 'F' as Grade),
  ];

  // Per-card extras from named upgrades (Auto-Irrigation adds a Watering Can,
  // Hybrid Lab adds a Fertilizer Bag, etc.). Always grade F since these are
  // bonus copies, not the player's own inventory.
  const ownedSet = new Set(upgrades);
  for (const upg of allUpgrades()) {
    if (!ownedSet.has(upg.id)) continue;
    if (upg.effect.type === 'starting_deck_extra_card') {
      for (let i = 0; i < upg.effect.value; i++) {
        startingDeck.push(upg.effect.cardId);
        startingDeckGrades.push('F');
      }
    }
  }

  return {
    seed,
    totalRounds: 12,
    startingHandSize: handSize,
    startingPlotCount: plotCount,
    startingDeck,
    startingDeckGrades,
    startingCoins,
    draftRounds: [3, 6, 9],
    draftCardCount: draftCount,
    perks,
    ownedUpgradeIdsForRun: upgrades,
    ownedCardIdsForRun: overrides.ownedCardIds,
    chosenOrdersForRun: overrides.chosenOrders,
    disableOrders: overrides.disableOrders,
    stageNumber: overrides.stageNumber,
  };
}

function ratingFor(coins: number, completedAllRounds: boolean, ordersAllFulfilled: boolean, ordersAnyFulfilled: boolean): Rating {
  // Run fails if rounds were cut short OR no orders were fulfilled at all.
  // A partial-fulfillment run is still a "survive" so the stage system can
  // award 1-2 stars. Full-fulfillment caps the rating at "mythic" by coins.
  if (!completedAllRounds) return 'fail';
  if (!ordersAnyFulfilled) return 'fail';
  if (!ordersAllFulfilled) {
    // Partial pass — we still give a coin-based rating but cap below gold so
    // the result UI can be clear that perfect = 3 stars.
    if (coins >= 1000) return 'silver';
    if (coins >= 300) return 'bronze';
    return 'survive';
  }
  if (coins >= 2500) return 'mythic';
  if (coins >= 1000) return 'gold';
  if (coins >= 500) return 'silver';
  if (coins >= 200) return 'bronze';
  return 'survive';
}

const emptyToolState = (): PersistentToolState => ({
  hazardShields: 0,
  tempPlotsRemaining: 0,
  compostBonusPerHarvest: 0,
  dripLineActive: false,
  rainbowSprinklerActive: false,
});

export class SeasonRunner {
  readonly config: SeasonConfig;
  state: RunState;
  phase: RunPhase = 'play';
  readonly actionLog: RunAction[] = [];
  // Cards currently offered in a draft (only meaningful when phase === 'draft').
  // Mode tags how the resolver should route the chosen + rejected cards:
  //   'season_pick'       — legacy round 3/6/9 draft; staged from a content
  //                          pool; chosen → discard; rest discarded silently.
  //   'tool_pick_to_hand_rest_bottom'  — chosen → hand; rest → deck bottom
  //                                      (Scout, Harvest Oracle).
  //   'tool_pick_to_hand_rest_discard' — chosen → hand; rest → discard
  //                                      (Curator's Pick).
  // pendingDraftGrades is set ONLY for tool drafts; season-draft entries
  // are content-pool cards that arrive at grade F.
  pendingDraft: CardId[] = [];
  pendingDraftGrades?: Grade[];
  pendingDraftMode: 'season_pick' | 'tool_pick_to_hand_rest_bottom' | 'tool_pick_to_hand_rest_discard' = 'season_pick';
  private rng: Rng;
  private upgradeSaleMultBonus: number;

  constructor(config: SeasonConfig, opts: { ownedUpgradeIds?: string[] } = {}) {
    this.config = config;
    this.rng = createRng(config.seed);
    this.upgradeSaleMultBonus = sumUpgradeEffect(opts.ownedUpgradeIds ?? [], 'global_sale_mult');

    // Build the deck + parallel grade array, then shuffle them in lock-step
    // so the grade always travels with its card across draw/discard moves.
    const baseGrades: Grade[] = config.startingDeckGrades && config.startingDeckGrades.length === config.startingDeck.length
      ? config.startingDeckGrades.slice()
      : config.startingDeck.map(() => 'F' as Grade);
    const indices = config.startingDeck.map((_, i) => i);
    const shuffled = this.rng.shuffle(indices);
    const deck = shuffled.map(i => config.startingDeck[i]);
    const deckGrades = shuffled.map(i => baseGrades[i]);
    const plots: PlotState[] = Array.from({ length: config.startingPlotCount }, () => ({ kind: 'empty' }));

    const wateringPro = findModifier(config.perks, 'watering_can_free_uses');
    const luckyStreak = findModifier(config.perks, 'forced_boon_count');
    this.state = {
      seed: config.seed,
      round: 1,
      totalRounds: config.totalRounds,
      coins: config.startingCoins,
      hand: [],
      deck,
      discard: [],
      handGrades: [],
      deckGrades,
      discardGrades: [],
      plots,
      relentlessStreak: 0,
      relentlessCrop: null,
      nextSeedGrowDelta: 0,
      nextSaleMultBonus: 0,
      pendingNextRoundDraws: 0,
      combosTotal: { onslaught: 0, triadic: 0, relentless: 0 },
      perks: config.perks.slice(),
      toolState: emptyToolState(),
      plantedThisRound: [],
      cropsHarvestedByType: {},
      cropsPlantedByType: {},
      toolDrawBonusUsed: 0,
      wateringCanFreeUses: wateringPro?.value ?? 0,
      firstSeedThisRoundUsed: false,
      forcedBoonsRemaining: luckyStreak?.value ?? 0,
      perkGoalRewards: 0,
      orders: config.disableOrders
        ? []
        : (config.chosenOrdersForRun && config.chosenOrdersForRun.length > 0
          // Pre-chosen by the player from the order-picker screen. We skip
          // the runner's own roll and use these directly — the seed-based
          // 5-card offer was rolled outside the runner so the picker could
          // present them. Each gets a fresh state with progress 0.
          ? config.chosenOrdersForRun.map(card => ({ card, progress: 0, fulfilled: false }))
          : rollOrdersForRun(this.rng, 3).map(card => ({ card, progress: 0, fulfilled: false }))),
    };

    // Round 1 opening draw, plus Extra Draw perk if present.
    const extraDraws = sumModifier(config.perks, 'round_one_extra_draw');
    const drawEvents = this.refillHand(extraDraws);
    this.openingEvents = [{ kind: 'round_started', round: 1 }, ...drawEvents];
  }

  openingEvents: RunEvent[];
  consumeOpeningEvents(): RunEvent[] {
    const e = this.openingEvents;
    this.openingEvents = [];
    return e;
  }

  apply(action: RunAction): RunEvent[] {
    if (this.phase === 'season_end') return [];
    this.actionLog.push(action);
    switch (action.kind) {
      case 'play_seed':
        if (this.phase !== 'play') return [];
        return this.playSeed(action.handIndex, action.plotIndex);
      case 'play_tool':
        if (this.phase !== 'play') return [];
        return this.playTool(action.handIndex, action.targetPlotIndex);
      case 'undo_plant':
        if (this.phase !== 'play') return [];
        return this.undoPlant(action.plotIndex);
      case 'end_round':
        if (this.phase !== 'play') return [];
        return this.endRound();
      case 'draft_pick':
        if (this.phase !== 'draft') return [];
        return this.resolveDraft(action.cardId);
      case 'draft_skip':
        if (this.phase !== 'draft') return [];
        return this.resolveDraft(null);
      case 'discard_cards':
        if (this.phase !== 'play') return [];
        return this.discardCards(action.handIndices);
    }
  }

  // Player-driven hand-cap discard. Removes the named hand indices and pushes
  // them to the discard pile. Indices are sorted descending so the splices
  // don't shift each other. Unknown indices are silently ignored.
  private discardCards(handIndices: number[]): RunEvent[] {
    const sorted = [...new Set(handIndices)].sort((a, b) => b - a);
    const removed: CardId[] = [];
    const removedGrades: Grade[] = [];
    for (const idx of sorted) {
      if (idx < 0 || idx >= this.state.hand.length) continue;
      const cardId = this.state.hand.splice(idx, 1)[0];
      const grade = this.state.handGrades.splice(idx, 1)[0] ?? 'F';
      this.state.discard.push(cardId);
      this.state.discardGrades.push(grade);
      removed.push(cardId);
      removedGrades.push(grade);
    }
    if (removed.length === 0) return [];
    return [{ kind: 'cards_discarded', cardIds: removed, grades: removedGrades }];
  }

  // === Player actions ===

  private playSeed(handIndex: number, plotIndex: number): RunEvent[] {
    const cardId = this.state.hand[handIndex];
    if (!cardId) return [];
    const card = getCard(cardId);
    if (card.type !== 'seed') return [];
    const plot = this.state.plots[plotIndex];
    if (!plot || plot.kind !== 'empty') return [];
    const grade = this.state.handGrades[handIndex] ?? 'F';

    // Sustained Growth perk + Greenhouse / Grow Lamps upgrades: first seed of
    // the round grows -1 (or more) round. Each contributes their delta.
    let firstSeedDelta = 0;
    if (!this.state.firstSeedThisRoundUsed) {
      firstSeedDelta = sumModifier(this.state.perks, 'first_seed_grow_delta')
        + sumUpgradeEffect(this.config.ownedUpgradeIdsForRun ?? [], 'first_seed_grow_delta');
      if (firstSeedDelta !== 0) this.state.firstSeedThisRoundUsed = true;
    }
    const grow = Math.max(1, card.growRounds + this.state.nextSeedGrowDelta + firstSeedDelta);
    this.state.nextSeedGrowDelta = 0;

    this.state.plots[plotIndex] = {
      kind: 'growing',
      crop: {
        cardId: card.id,
        crop: card.crop,
        growRoundsRemaining: grow,
        // Bake the grade multiplier into sellPrice at plant time so the
        // engine never has to re-apply it during harvest math (and Wheelbarrow
        // / Harvest Basket also pick up the boost automatically).
        sellPrice: gradedSellPrice(card.sellPrice, grade),
        grade,
      },
    };
    this.state.hand.splice(handIndex, 1);
    this.state.handGrades.splice(handIndex, 1);
    this.state.plantedThisRound.push(plotIndex);

    // Track planting for goal-tracking perks (Corn Field Bonus etc.)
    this.state.cropsPlantedByType[card.crop] = (this.state.cropsPlantedByType[card.crop] ?? 0) + 1;

    const orderEvents = [
      ...this.advanceOrdersFor('plant_any'),
      ...this.advanceOrdersFor('plant_crop', card.crop),
    ];
    return [{ kind: 'seed_planted', cardId: card.id, plotIndex, grade }, ...orderEvents];
  }

  // Returns the planted seed in `plotIndex` to the player's hand if it was planted
  // this round and is still in growing state. Tools applied to that plot (Watering Can,
  // Fertilizer Bag) are NOT refunded — undo only reverses the plant action itself.
  private undoPlant(plotIndex: number): RunEvent[] {
    const idx = this.state.plantedThisRound.indexOf(plotIndex);
    if (idx < 0) return [];
    const plot = this.state.plots[plotIndex];
    if (plot.kind !== 'growing') return [];
    const cardId = plot.crop.cardId;
    const grade = plot.crop.grade;
    this.state.hand.push(cardId);
    this.state.handGrades.push(grade);
    this.state.plots[plotIndex] = { kind: 'empty' };
    this.state.plantedThisRound.splice(idx, 1);
    return [{ kind: 'plant_undone', cardId, plotIndex, grade }];
  }

  private playTool(handIndex: number, targetPlotIndex?: number): RunEvent[] {
    const cardId = this.state.hand[handIndex];
    if (!cardId) return [];
    const card = getCard(cardId);
    if (card.type !== 'tool') return [];

    const effectEvents = this.applyToolEffect(card, targetPlotIndex, handIndex);
    if (effectEvents === null) return []; // invalid target → card stays in hand

    // Watering Pro perk: first N Watering Cans don't consume the card.
    const isWateringCan = card.id === 'tool.watering_can';
    const consumesCard = !(isWateringCan && this.state.wateringCanFreeUses > 0);
    if (isWateringCan && !consumesCard) {
      this.state.wateringCanFreeUses -= 1;
    }
    if (consumesCard) {
      // Re-locate the tool — applyToolEffect may have spliced cards out of
      // the hand (Garden Fork / Swap Seeds / Recycle / Market Research),
      // shifting the original handIndex. Walk from the original index
      // backwards/forwards to find the tool's current slot. Falls back to
      // a linear search if the index drifted out of range.
      let removeIdx = handIndex;
      if (removeIdx >= this.state.hand.length || this.state.hand[removeIdx] !== card.id) {
        removeIdx = this.state.hand.indexOf(card.id);
      }
      if (removeIdx >= 0) {
        this.state.hand.splice(removeIdx, 1);
        // Tools always carry grade 'F' but we still need to keep arrays aligned.
        const toolGrade = this.state.handGrades.splice(removeIdx, 1)[0] ?? 'F';
        this.state.discard.push(card.id);
        this.state.discardGrades.push(toolGrade);
      }
    }

    // Tool Master perk: +N draws per tool use, capped per season.
    const toolDraw = findModifier(this.state.perks, 'tool_draw_bonus');
    let bonusDrawEvents: RunEvent[] = [];
    if (toolDraw && this.state.toolDrawBonusUsed < toolDraw.cap) {
      const slots = Math.min(toolDraw.value, toolDraw.cap - this.state.toolDrawBonusUsed);
      this.state.toolDrawBonusUsed += slots;
      bonusDrawEvents = this.drawN(slots);
    }

    // Order matching for tools. Every successful tool use ticks a "use_tools"
    // order; watering specifically also ticks "water_plots".
    const orderEvents: RunEvent[] = [...this.advanceOrdersFor('use_tools')];
    if (isWateringCan) {
      orderEvents.push(...this.advanceOrdersFor('water_plots'));
    }

    return [{ kind: 'tool_used', cardId: card.id, targetPlotIndex }, ...effectEvents, ...bonusDrawEvents, ...orderEvents];
  }

  // Returns null if the tool requires a target it didn't receive.
  // Otherwise returns the (possibly empty) list of follow-up events.
  // `handIndex` is the slot the tool itself occupies; hand-touching tools
  // (Garden Fork, Swap Seeds, Recycle, Market Research) MUST skip this slot
  // when picking random discards, otherwise the tool can roll itself as a
  // discard target before playTool's own removal step runs — which leaves
  // the engine's hand/discard arrays in a corrupt state. Tools that don't
  // touch the hand can ignore this argument.
  private applyToolEffect(card: ToolCard, targetPlotIndex?: number, handIndex?: number): RunEvent[] | null {
    switch (card.id) {
      case 'tool.watering_can': {
        if (targetPlotIndex === undefined) return null;
        const plot = this.state.plots[targetPlotIndex];
        if (!plot || plot.kind !== 'growing') return null;
        plot.crop.growRoundsRemaining = Math.max(0, plot.crop.growRoundsRemaining - 1);
        if (plot.crop.growRoundsRemaining === 0) {
          this.state.plots[targetPlotIndex] = { kind: 'ready', crop: plot.crop };
          return [{ kind: 'crop_ready', plotIndex: targetPlotIndex }];
        }
        return [];
      }
      case 'tool.fertilizer_bag': {
        this.state.nextSeedGrowDelta = Math.min(0, this.state.nextSeedGrowDelta - 1);
        return [];
      }
      case 'tool.garden_fork': {
        // Discard up to 2 random cards from hand, then draw 3.
        // Excludes the tool's own slot — picking the Garden Fork itself as
        // a discard target corrupts the hand/discard arrays because
        // playTool() then re-removes from the (now-shifted) handIndex.
        this.discardRandomFromHand(2, handIndex);
        return this.drawN(3);
      }
      case 'tool.wheelbarrow': {
        // Sell ready crop early at 80% (plot must be ready or growing — growing also allowed at reduced).
        if (targetPlotIndex === undefined) return null;
        const plot = this.state.plots[targetPlotIndex];
        if (!plot || plot.kind === 'empty') return null;
        let price = Math.round(plot.crop.sellPrice * 0.8);
        // Order-price split also applies here: half if no order accepts it.
        if (this.state.orders.length > 0) {
          const matchingOrder = this.state.orders.find(o => orderAcceptsCrop(o, plot.crop.crop));
          if (!matchingOrder) price = Math.round(price * 0.5);
        }
        this.state.coins += price;
        this.state.discard.push(plot.crop.cardId);
        this.state.discardGrades.push(plot.crop.grade);
        this.state.plots[targetPlotIndex] = { kind: 'empty' };
        const orderEvents = [
          ...this.advanceOrdersFor('harvest_any'),
          ...this.advanceOrdersFor('harvest_crop', plot.crop.crop),
        ];
        return [{
          kind: 'crop_harvested',
          plotIndex: targetPlotIndex,
          cardId: plot.crop.cardId,
          finalPrice: price,
          onslaughtMult: 0.8,
          relentlessMult: 1,
        }, ...orderEvents];
      }
      case 'tool.scarecrow': {
        this.state.toolState.hazardShields += 1;
        return [];
      }
      case 'tool.silver_hoe': {
        // Add a temporary plot for 2 rounds + draw 1 immediately.
        this.state.plots.push({ kind: 'empty' });
        this.state.toolState.tempPlotsRemaining += 2;
        return this.drawN(1);
      }
      case 'tool.seed_vault': {
        // Duplicate the most recent seed in discard back to hand. The duplicate
        // keeps the same grade as the source card.
        for (let i = this.state.discard.length - 1; i >= 0; i--) {
          const id = this.state.discard[i];
          if (getCard(id).type === 'seed') {
            const grade = this.state.discardGrades[i] ?? 'F';
            this.state.hand.push(id);
            this.state.handGrades.push(grade);
            return [{ kind: 'card_drawn', cardId: id, handIndex: this.state.hand.length - 1, grade }];
          }
        }
        return [];
      }
      case 'tool.compost_heap': {
        this.state.toolState.compostBonusPerHarvest += 2;
        return [];
      }
      case 'tool.drip_line': {
        this.state.toolState.dripLineActive = true;
        return [];
      }
      case 'tool.growth_potion': {
        if (targetPlotIndex === undefined) return null;
        const plot = this.state.plots[targetPlotIndex];
        if (!plot || plot.kind !== 'growing') return null;
        this.state.plots[targetPlotIndex] = { kind: 'ready', crop: plot.crop };
        return [{ kind: 'crop_ready', plotIndex: targetPlotIndex }];
      }
      case 'tool.golden_trowel': {
        this.state.nextSaleMultBonus += 0.5;
        return [];
      }
      case 'tool.rainbow_sprinkler': {
        this.state.toolState.rainbowSprinklerActive = true;
        return [];
      }
      case 'tool.harvest_basket': {
        // Take up to 2 ready crops from plots, sell them at base price (no
        // combo math), clear the plots, add coins. No event for the side
        // effect of "skipping" the harvest cycle — fires crop_harvested events
        // so the visual layer animates properly.
        const events: RunEvent[] = [];
        let taken = 0;
        for (let i = 0; i < this.state.plots.length && taken < 2; i++) {
          const plot = this.state.plots[i];
          if (plot.kind !== 'ready') continue;
          let price = plot.crop.sellPrice;
          if (this.state.orders.length > 0) {
            const matchingOrder = this.state.orders.find(o => orderAcceptsCrop(o, plot.crop.crop));
            if (!matchingOrder) price = Math.round(price * 0.5);
          }
          this.state.coins += price;
          events.push({
            kind: 'crop_harvested',
            plotIndex: i,
            cardId: plot.crop.cardId,
            finalPrice: price,
            onslaughtMult: 1,
            relentlessMult: 1,
          });
          this.state.cropsHarvestedByType[plot.crop.crop] =
            (this.state.cropsHarvestedByType[plot.crop.crop] ?? 0) + 1;
          this.state.discard.push(plot.crop.cardId);
          this.state.discardGrades.push(plot.crop.grade);
          this.state.plots[i] = { kind: 'empty' };
          taken += 1;
          events.push(...this.advanceOrdersFor('harvest_any'));
          events.push(...this.advanceOrdersFor('harvest_crop', plot.crop.crop));
        }
        return events;
      }
      case 'tool.market_bell': {
        // Trigger early Market Day: end the season immediately on round 7+.
        // For simplicity, only valid from round 7 onward (per GDD spec).
        if (this.state.round < 7) return null;
        this.phase = 'season_end';
        return [{ kind: 'season_ended', result: this.buildResult(true) }];
      }
      case 'tool.season_compass':
        // Phase 7: still a no-op effect-wise. Future: predict next 3 events.
        return [];

      // === Utility tools — deck/hand manipulation ===
      // Common tier:
      case 'tool.quick_draw': {
        return this.drawN(1);
      }
      case 'tool.bulk_order': {
        return this.drawN(2);
      }
      case 'tool.swap_seeds': {
        // Discard 1 random card from hand (skipping the tool's own slot),
        // then draw 1.
        this.discardRandomFromHand(1, handIndex);
        return this.drawN(1);
      }

      // Uncommon tier:
      case 'tool.scout': {
        // Stage top 3 of deck (with reshuffle if needed) and let the player
        // pick 1 → hand. Rejected cards go to deck bottom, NOT discard, so
        // Scout actually peeks rather than churning the deck.
        return this.stageDeckDraft(3, 'tool_pick_to_hand_rest_bottom');
      }
      case 'tool.market_research': {
        // Discard everything in hand EXCEPT this tool (playTool's own removal
        // step takes care of the tool). Then draw N + 1, where N is the
        // number of cards just dumped.
        let discarded = 0;
        const keepIdx = handIndex ?? -1;
        const keptHand: CardId[] = [];
        const keptGrades: Grade[] = [];
        for (let i = 0; i < this.state.hand.length; i++) {
          if (i === keepIdx) {
            keptHand.push(this.state.hand[i]);
            keptGrades.push(this.state.handGrades[i] ?? 'F');
          } else {
            this.state.discard.push(this.state.hand[i]);
            this.state.discardGrades.push(this.state.handGrades[i] ?? 'F');
            discarded++;
          }
        }
        this.state.hand = keptHand;
        this.state.handGrades = keptGrades;
        return this.drawN(discarded + 1);
      }
      case 'tool.recycle': {
        // Discard 1 random card (skipping the tool's own slot), then draw 2.
        this.discardRandomFromHand(1, handIndex);
        return this.drawN(2);
      }

      // Rare tier:
      case 'tool.tactical_dig': {
        return this.drawN(3);
      }
      case 'tool.curators_pick': {
        // Stage top 3, choose 1 to hand, the other 2 go to discard.
        return this.stageDeckDraft(3, 'tool_pick_to_hand_rest_discard');
      }
      case 'tool.seed_exchange': {
        // Discard one random SEED from hand (no-op on a hand with no seeds),
        // then draw 2 cards. The tool's own slot is skipped defensively
        // (Seed Exchange itself is a tool, but the guard means future
        // seed-typed cards using this branch don't break.)
        const seedIndices: number[] = [];
        for (let i = 0; i < this.state.hand.length; i++) {
          if (i === handIndex) continue;
          if (getCard(this.state.hand[i]).type === 'seed') seedIndices.push(i);
        }
        if (seedIndices.length > 0) {
          const idx = seedIndices[this.rng.int(seedIndices.length)];
          this.state.discard.push(this.state.hand.splice(idx, 1)[0]);
          this.state.discardGrades.push(this.state.handGrades.splice(idx, 1)[0] ?? 'F');
        }
        return this.drawN(2);
      }

      // Legendary tier:
      case 'tool.harvest_oracle': {
        // Stage top 5; choose 1 to hand. Other 4 go to deck bottom — pure
        // peek + pull, no churn.
        return this.stageDeckDraft(5, 'tool_pick_to_hand_rest_bottom');
      }

      default:
        return [];
    }
  }

  // Pull up to N cards off the top of the deck (reshuffling if needed) and
  // stage them as a pending draft with the given mode. The runner switches
  // to phase 'draft' and emits draft_offered so the UI can present a picker.
  // The caller (applyToolEffect) returns the resulting events — including
  // any deck_reshuffled events fired while drawing the staged cards.
  private stageDeckDraft(count: number, mode: 'tool_pick_to_hand_rest_bottom' | 'tool_pick_to_hand_rest_discard'): RunEvent[] {
    const stagedIds: CardId[] = [];
    const stagedGrades: Grade[] = [];
    const events: RunEvent[] = [];
    for (let i = 0; i < count; i++) {
      const drawn = this.drawOne();
      if (drawn === null) break;
      stagedIds.push(drawn.cardId);
      stagedGrades.push(drawn.grade);
      if (drawn.reshuffled) events.push({ kind: 'deck_reshuffled' });
    }
    // If nothing came out of the deck (truly empty + empty discard), the
    // tool was wasted but not invalid — return whatever events we gathered
    // and skip the draft phase.
    if (stagedIds.length === 0) return events;

    this.pendingDraft = stagedIds;
    this.pendingDraftGrades = stagedGrades;
    this.pendingDraftMode = mode;
    this.phase = 'draft';
    events.push({ kind: 'draft_offered', cards: stagedIds });
    return events;
  }

  // === End round cascade ===

  private endRound(): RunEvent[] {
    const events: RunEvent[] = [];
    const round = this.state.round;
    let suppressGrowthThisRound = false;
    let roundSaleMultBonus = 0;

    // 0. Roll for an in-game event (boon/hazard/special) — applies BEFORE grow phase.
    // Lucky Streak perk: first N events are forced to boons.
    const forceBoon = this.state.forcedBoonsRemaining > 0;
    const event = rollEventForRound(round, this.rng, forceBoon);
    if (event && forceBoon) {
      this.state.forcedBoonsRemaining = Math.max(0, this.state.forcedBoonsRemaining - 1);
    }
    if (event) {
      events.push({ kind: 'event_triggered', event, round });
      const { suppressGrowth, saleMultBonus, coinsDelta } = this.applyEventEffect(event);
      if (suppressGrowth) suppressGrowthThisRound = true;
      roundSaleMultBonus += saleMultBonus;
      events.push({ kind: 'event_resolved', event, coinsDelta });
    }

    // 1. Persistent tool effects that run before grow tick.
    if (this.state.toolState.rainbowSprinklerActive && !suppressGrowthThisRound) {
      this.advanceAllSeeds(1, events);
    }
    if (this.state.toolState.dripLineActive && round >= 4 && round <= 8 && !suppressGrowthThisRound) {
      this.advanceAllSeeds(1, events);
    }

    // 2. Grow phase: tick all growing plots (unless drought).
    if (!suppressGrowthThisRound) {
      for (let i = 0; i < this.state.plots.length; i++) {
        const plot = this.state.plots[i];
        if (plot.kind === 'growing') {
          plot.crop.growRoundsRemaining -= 1;
          if (plot.crop.growRoundsRemaining <= 0) {
            this.state.plots[i] = { kind: 'ready', crop: plot.crop };
            events.push({ kind: 'crop_ready', plotIndex: i });
          } else {
            events.push({ kind: 'crop_grew', plotIndex: i, remaining: plot.crop.growRoundsRemaining });
          }
        }
      }
    }

    // 3. Harvest phase.
    const readyHarvests: { plotIndex: number; cardId: CardId; crop: CropType; basePrice: number; grade: Grade }[] = [];
    for (let i = 0; i < this.state.plots.length; i++) {
      const plot = this.state.plots[i];
      if (plot.kind === 'ready') {
        readyHarvests.push({ plotIndex: i, cardId: plot.crop.cardId, crop: plot.crop.crop, basePrice: plot.crop.sellPrice, grade: plot.crop.grade });
      }
    }

    if (readyHarvests.length > 0) {
      const result = resolveHarvests(
        readyHarvests.map(h => ({ crop: h.crop, basePrice: h.basePrice })),
        {
          perks: this.state.perks,
          relentlessStreakBefore: this.state.relentlessStreak,
          relentlessCropBefore: this.state.relentlessCrop,
          round,
          roundSaleMultBonus: roundSaleMultBonus + this.upgradeSaleMultBonus,
        },
      );

      // Apply per-crop price (with one-shot Golden Trowel bonus on first harvest).
      let goldenTrowelLeft = this.state.nextSaleMultBonus;
      this.state.nextSaleMultBonus = 0;
      const compostBonus = this.state.toolState.compostBonusPerHarvest;
      let coinsThisRound = 0;

      for (let i = 0; i < readyHarvests.length; i++) {
        const h = readyHarvests[i];
        const r = result.harvests[i];
        let finalPrice = r.finalPrice;
        if (goldenTrowelLeft > 0) {
          finalPrice = Math.round(finalPrice * (1 + goldenTrowelLeft));
          goldenTrowelLeft = 0;
        }
        finalPrice += compostBonus;

        // Order matching: a crop accepted by an active order pays full price
        // and advances that order; otherwise the crop sells at HALF price.
        // First-fit: the first non-fulfilled order accepting this crop wins.
        // If the run has no orders (test mode), no penalty applies.
        if (this.state.orders.length > 0) {
          const matchingOrder = this.state.orders.find(o => orderAcceptsCrop(o, h.crop));
          if (!matchingOrder) {
            finalPrice = Math.round(finalPrice * 0.5);
          }
        }

        events.push({
          kind: 'crop_harvested',
          plotIndex: h.plotIndex,
          cardId: h.cardId,
          finalPrice,
          onslaughtMult: r.onslaughtMult,
          relentlessMult: r.relentlessMult,
        });
        this.state.discard.push(h.cardId);
        this.state.discardGrades.push(h.grade);
        this.state.plots[h.plotIndex] = { kind: 'empty' };
        coinsThisRound += finalPrice;
        // Track harvested crop counts for goal-tracking perks (Carrot Specialist).
        this.state.cropsHarvestedByType[h.crop] =
          (this.state.cropsHarvestedByType[h.crop] ?? 0) + 1;

        // Advance every harvest-style order this crop can satisfy.
        const orderEvents = this.advanceOrdersFor('harvest_any');
        events.push(...orderEvents);
        const cropOrderEvents = this.advanceOrdersFor('harvest_crop', h.crop);
        events.push(...cropOrderEvents);
      }
      coinsThisRound += result.triadicBonus;

      this.state.coins += coinsThisRound;
      this.state.relentlessStreak = result.relentlessStreakAfter;
      const distinct = new Set(readyHarvests.map(h => h.crop));
      this.state.relentlessCrop = distinct.size === 1 ? readyHarvests[0].crop : null;

      let triggeredAny = false;
      if (result.combosTriggered.onslaught) {
        events.push({ kind: 'combo_triggered', combo: 'onslaught' });
        this.state.combosTotal.onslaught++;
        triggeredAny = true;
        events.push(...this.advanceOrdersFor('combo', 'onslaught' as unknown as CropType));
      }
      if (result.combosTriggered.triadic) {
        events.push({ kind: 'combo_triggered', combo: 'triadic' });
        this.state.combosTotal.triadic++;
        triggeredAny = true;
        events.push(...this.advanceOrdersFor('combo', 'triadic' as unknown as CropType));
      }
      if (result.combosTriggered.relentless) {
        events.push({ kind: 'combo_triggered', combo: 'relentless' });
        this.state.combosTotal.relentless++;
        triggeredAny = true;
        events.push(...this.advanceOrdersFor('combo', 'relentless' as unknown as CropType));
      }

      if (triggeredAny) {
        const cascade = sumModifier(this.state.perks, 'combo_cascade_draw');
        if (cascade > 0) this.state.pendingNextRoundDraws += cascade;
      }

      events.push({ kind: 'round_resolved', result: { ...result, totalCoinsThisRound: coinsThisRound } });
    } else {
      events.push({
        kind: 'round_resolved',
        result: {
          round,
          harvests: [],
          triadicBonus: 0,
          totalCoinsThisRound: 0,
          relentlessStreakAfter: this.state.relentlessStreak,
          combosTriggered: { onslaught: false, triadic: false, relentless: false },
        },
      });
    }

    // 4. Tick down temporary plots (Silver Hoe).
    if (this.state.toolState.tempPlotsRemaining > 0) {
      this.state.toolState.tempPlotsRemaining -= 1;
      if (this.state.toolState.tempPlotsRemaining === 0) {
        // Remove trailing empty plot if it's still empty (don't kick out a planted crop).
        for (let i = this.state.plots.length - 1; i >= this.config.startingPlotCount; i--) {
          if (this.state.plots[i].kind === 'empty') {
            this.state.plots.splice(i, 1);
            break;
          }
        }
      }
    }

    // 5. Advance round or end season.
    if (round >= this.state.totalRounds) {
      this.phase = 'season_end';
      events.push({ kind: 'season_ended', result: this.buildResult(true) });
      return events;
    }

    this.state.round += 1;
    // New round → past placements are no longer undoable.
    this.state.plantedThisRound = [];
    // Sustained Growth perk resets per round.
    this.state.firstSeedThisRoundUsed = false;

    // 6. Maybe pause for a draft pick.
    if (this.config.draftRounds.includes(round)) {
      this.pendingDraft = this.rollDraftCards();
      this.pendingDraftGrades = undefined;
      this.pendingDraftMode = 'season_pick';
      this.phase = 'draft';
      events.push({ kind: 'draft_offered', cards: this.pendingDraft });
      return events;
    }

    // 7. Otherwise continue: round_started + refill hand.
    events.push({ kind: 'round_started', round: this.state.round });
    events.push(...this.refillHand());
    return events;
  }

  private resolveDraft(cardId: CardId | null): RunEvent[] {
    const events: RunEvent[] = [{ kind: 'draft_resolved', cardId }];
    const mode = this.pendingDraftMode;
    const stagedIds = this.pendingDraft.slice();
    const stagedGrades = this.pendingDraftGrades?.slice();

    if (mode === 'season_pick') {
      // Legacy season-draft: chosen card → discard at grade F. Rejected
      // cards are content-pool placeholders, so they vanish silently.
      if (cardId && stagedIds.includes(cardId)) {
        this.state.discard.push(cardId);
        this.state.discardGrades.push('F');
      }
    } else {
      // Tool drafts: cards were pulled from the player's deck and need to
      // route somewhere now that the player has chosen.
      const chosenIdx = cardId ? stagedIds.indexOf(cardId) : -1;
      if (chosenIdx >= 0) {
        const grade = stagedGrades?.[chosenIdx] ?? 'F';
        this.state.hand.push(stagedIds[chosenIdx]);
        this.state.handGrades.push(grade);
        events.push({ kind: 'card_drawn', cardId: stagedIds[chosenIdx], handIndex: this.state.hand.length - 1, grade });
      }
      // The remaining staged cards get routed per mode.
      for (let i = 0; i < stagedIds.length; i++) {
        if (i === chosenIdx) continue;
        const id = stagedIds[i];
        const grade = stagedGrades?.[i] ?? 'F';
        if (mode === 'tool_pick_to_hand_rest_bottom') {
          this.state.deck.push(id);
          this.state.deckGrades.push(grade);
        } else {
          this.state.discard.push(id);
          this.state.discardGrades.push(grade);
        }
      }
    }

    this.pendingDraft = [];
    this.pendingDraftGrades = undefined;
    this.pendingDraftMode = 'season_pick';
    this.phase = 'play';
    // Tool drafts happen mid-round and shouldn't trigger a new
    // round_started + refillHand cascade — that's only for the legacy
    // round 3/6/9 draft which happens AT the round boundary.
    if (mode === 'season_pick') {
      events.push({ kind: 'round_started', round: this.state.round });
      events.push(...this.refillHand());
    }
    return events;
  }

  private rollDraftCards(): CardId[] {
    // Common/Uncommon/Rare only — Mythic & Legendary stay out of the draft.
    let pool = [
      ...allSeeds().filter(s => ['common', 'uncommon', 'rare'].includes(s.rarity)),
      ...allTools().filter(t => ['common', 'uncommon', 'rare'].includes(t.rarity)),
    ];
    // Owned-only filter: when the run was started with the player's owned
    // card list, the draft can ONLY offer cards they already have. If the
    // intersection is empty (brand-new account, every card un-owned) we fall
    // back to the full pool so the draft never offers nothing — the player
    // would otherwise see an empty modal and feel cheated.
    const owned = this.config.ownedCardIdsForRun;
    if (owned && owned.length > 0) {
      const ownedSet = new Set(owned);
      const filtered = pool.filter(c => ownedSet.has(c.id));
      if (filtered.length > 0) pool = filtered;
    }
    const out: CardId[] = [];
    const used = new Set<CardId>();
    while (out.length < this.config.draftCardCount && out.length < pool.length) {
      const candidate = this.rng.pick(pool);
      if (used.has(candidate.id)) continue;
      used.add(candidate.id);
      out.push(candidate.id);
    }
    return out;
  }

  // === Event effects ===

  private applyEventEffect(event: EventCard): { suppressGrowth: boolean; saleMultBonus: number; coinsDelta: number } {
    let suppressGrowth = false;
    let saleMultBonus = 0;
    let coinsDelta = 0;

    switch (event.effect.type) {
      case 'advance_all_seeds':
        for (let i = 0; i < this.state.plots.length; i++) {
          const plot = this.state.plots[i];
          if (plot.kind === 'growing') {
            plot.crop.growRoundsRemaining = Math.max(0, plot.crop.growRoundsRemaining - event.effect.value);
            if (plot.crop.growRoundsRemaining === 0) {
              this.state.plots[i] = { kind: 'ready', crop: plot.crop };
            }
          }
        }
        break;
      case 'round_sale_mult':
        saleMultBonus = event.effect.value;
        break;
      case 'free_coins':
        coinsDelta = event.effect.value;
        this.state.coins += event.effect.value;
        break;
      case 'random_seed_setback': {
        const growing: number[] = [];
        for (let i = 0; i < this.state.plots.length; i++) {
          if (this.state.plots[i].kind === 'growing') growing.push(i);
        }
        if (growing.length > 0) {
          const idx = growing[this.rng.int(growing.length)];
          const plot = this.state.plots[idx];
          if (plot.kind === 'growing') plot.crop.growRoundsRemaining += event.effect.value;
        }
        break;
      }
      case 'pay_coins':
        if (this.state.toolState.hazardShields > 0) {
          this.state.toolState.hazardShields -= 1;
        } else {
          coinsDelta = -event.effect.value;
          this.state.coins = Math.max(0, this.state.coins - event.effect.value);
        }
        break;
      case 'no_growth_this_round':
        if (this.state.toolState.hazardShields > 0) {
          this.state.toolState.hazardShields -= 1;
        } else {
          suppressGrowth = true;
        }
        break;
    }

    return { suppressGrowth, saleMultBonus, coinsDelta };
  }

  private advanceAllSeeds(ticks: number, events: RunEvent[]): void {
    for (let i = 0; i < this.state.plots.length; i++) {
      const plot = this.state.plots[i];
      if (plot.kind === 'growing') {
        plot.crop.growRoundsRemaining = Math.max(0, plot.crop.growRoundsRemaining - ticks);
        if (plot.crop.growRoundsRemaining === 0) {
          this.state.plots[i] = { kind: 'ready', crop: plot.crop };
          events.push({ kind: 'crop_ready', plotIndex: i });
        } else {
          events.push({ kind: 'crop_grew', plotIndex: i, remaining: plot.crop.growRoundsRemaining });
        }
      }
    }
  }

  private buildResult(completedAllRounds: boolean): RunResult {
    // Goal-tracking perks: evaluate at season end. Each completed goal adds its
    // reward to the final coin total.
    let goalBonus = 0;
    for (const perk of this.state.perks) {
      if (perk.modifier.type === 'goal_harvest_crop') {
        const m = perk.modifier;
        const got = this.state.cropsHarvestedByType[m.crop] ?? 0;
        if (got >= m.goal) goalBonus += m.reward;
      } else if (perk.modifier.type === 'goal_plant_crop') {
        const m = perk.modifier;
        const got = this.state.cropsPlantedByType[m.crop] ?? 0;
        if (got >= m.goal) goalBonus += m.reward;
      }
    }
    if (goalBonus > 0) {
      this.state.coins += goalBonus;
      this.state.perkGoalRewards = goalBonus;
    }

    // Order failure penalty: if the run had orders and NONE of them were
    // fulfilled, the run is considered a FAIL and the player only takes home
    // 20% of their earnings. With at least one fulfilled order we now treat
    // it as a partial pass (stage system uses stars for grading), so the
    // player still keeps full earnings — the stage just gets a lower star
    // count. Runs without orders (tests, Market Bell early-end) skip entirely.
    const hasOrders = this.state.orders.length > 0;
    const fulfilledCount = this.state.orders.filter(o => o.fulfilled).length;
    const ordersAllFulfilled = !hasOrders || fulfilledCount === this.state.orders.length;
    const ordersAnyFulfilled = !hasOrders || fulfilledCount > 0;
    if (hasOrders && !ordersAnyFulfilled) {
      this.state.coins = Math.floor(this.state.coins * 0.2);
    }

    return {
      finalCoins: this.state.coins,
      rounds: this.state.round,
      combosTotal: { ...this.state.combosTotal },
      rating: ratingFor(this.state.coins, completedAllRounds, ordersAllFulfilled, ordersAnyFulfilled),
      orders: this.state.orders.map(o => ({
        id: o.card.id,
        title: o.card.title,
        description: o.card.description,
        icon: o.card.icon,
        difficulty: o.card.difficulty,
        reward: o.card.reward,
        progress: o.progress,
        goal: o.card.objective.goal,
        fulfilled: o.fulfilled,
      })),
      stageNumber: this.config.stageNumber,
    };
  }

  // === Orders ===

  // Advance every active order whose objective matches `kind`. `cropType`
  // narrows crop-specific objectives. Pays the bonus reward when an order
  // flips to fulfilled. Returns the events to enqueue (caller decides where
  // to place them in the event stream).
  private advanceOrdersFor(
    kind: OrderObjective['type'],
    cropType?: CropType,
    delta = 1,
  ): RunEvent[] {
    const events: RunEvent[] = [];
    for (const o of this.state.orders) {
      if (o.fulfilled) continue;
      const obj = o.card.objective;
      let matches = false;
      switch (kind) {
        case 'harvest_crop': matches = obj.type === 'harvest_crop' && obj.crop === cropType; break;
        case 'harvest_any':  matches = obj.type === 'harvest_any'; break;
        case 'water_plots':  matches = obj.type === 'water_plots'; break;
        case 'combo':
          // Caller passes the combo id in cropType slot — repurposed to keep
          // the helper signature small. Compare against the combo id stored
          // on the objective.
          matches = obj.type === 'combo' && (obj.combo as string) === (cropType as string);
          break;
        case 'plant_crop':   matches = obj.type === 'plant_crop' && obj.crop === cropType; break;
        case 'plant_any':    matches = obj.type === 'plant_any'; break;
        case 'use_tools':    matches = obj.type === 'use_tools'; break;
      }
      if (!matches) continue;
      const before = o.progress;
      const goal = obj.goal;
      o.progress = Math.min(goal, o.progress + delta);
      const fulfilledNow = before < goal && o.progress >= goal;
      if (fulfilledNow) {
        o.fulfilled = true;
        this.state.coins += o.card.reward;
      }
      events.push({ kind: 'order_progress', orderId: o.card.id, progress: o.progress, goal, fulfilledNow });
      if (fulfilledNow) {
        events.push({ kind: 'order_fulfilled', orderId: o.card.id, reward: o.card.reward });
      }
    }
    return events;
  }

  // === Deck plumbing ===

  private refillHand(extraDraws = 0): RunEvent[] {
    const events: RunEvent[] = [];
    const target = this.config.startingHandSize + extraDraws + this.state.pendingNextRoundDraws;
    this.state.pendingNextRoundDraws = 0;
    while (this.state.hand.length < target) {
      const drawn = this.drawOne();
      if (drawn === null) break;
      this.state.hand.push(drawn.cardId);
      this.state.handGrades.push(drawn.grade);
      if (drawn.reshuffled) events.push({ kind: 'deck_reshuffled' });
      events.push({ kind: 'card_drawn', cardId: drawn.cardId, handIndex: this.state.hand.length - 1, grade: drawn.grade });
    }
    return events;
  }

  // Discard up to `count` random cards from the player's hand, skipping the
  // index `excludeIndex` if provided. Used by Garden Fork / Swap Seeds /
  // Recycle so a tool can never pick itself as a discard target — that
  // would corrupt the hand/discard arrays once playTool() runs its own
  // removal step at the original handIndex.
  private discardRandomFromHand(count: number, excludeIndex?: number): void {
    for (let i = 0; i < count; i++) {
      // Build the eligible-index list each iteration because every discard
      // shifts subsequent indices, including potentially `excludeIndex`.
      const eligible: number[] = [];
      for (let j = 0; j < this.state.hand.length; j++) {
        if (j !== excludeIndex) eligible.push(j);
      }
      if (eligible.length === 0) return;
      const pick = eligible[this.rng.int(eligible.length)];
      this.state.discard.push(this.state.hand.splice(pick, 1)[0]);
      this.state.discardGrades.push(this.state.handGrades.splice(pick, 1)[0] ?? 'F');
      // After the splice, indices > pick shifted left by 1. The excluded
      // tool slot must be tracked in the same coordinate system as `j`
      // above, so update it if it was after the picked index.
      if (excludeIndex !== undefined && pick < excludeIndex) {
        excludeIndex = excludeIndex - 1;
      }
    }
  }

  private drawN(n: number): RunEvent[] {
    const events: RunEvent[] = [];
    for (let i = 0; i < n; i++) {
      const drawn = this.drawOne();
      if (drawn === null) break;
      this.state.hand.push(drawn.cardId);
      this.state.handGrades.push(drawn.grade);
      if (drawn.reshuffled) events.push({ kind: 'deck_reshuffled' });
      events.push({ kind: 'card_drawn', cardId: drawn.cardId, handIndex: this.state.hand.length - 1, grade: drawn.grade });
    }
    return events;
  }

  // Reshuffle the discard pile into the deck, keeping the per-card grade in
  // lock-step. Uses an index permutation so cardId and grade arrays land in
  // the same order.
  private reshuffleDiscardIntoDeck(): void {
    const indices = this.state.discard.map((_, i) => i);
    const shuffled = this.rng.shuffle(indices);
    this.state.deck = shuffled.map(i => this.state.discard[i]);
    this.state.deckGrades = shuffled.map(i => this.state.discardGrades[i]);
    this.state.discard = [];
    this.state.discardGrades = [];
  }

  private drawOne(): { cardId: CardId; grade: Grade; reshuffled: boolean } | null {
    if (this.state.deck.length === 0) {
      if (this.state.discard.length === 0) return null;
      this.reshuffleDiscardIntoDeck();
      const cardId = this.state.deck.shift()!;
      const grade = this.state.deckGrades.shift() ?? 'F';
      return { cardId, grade, reshuffled: true };
    }
    const cardId = this.state.deck.shift()!;
    const grade = this.state.deckGrades.shift() ?? 'F';
    return { cardId, grade, reshuffled: false };
  }
}

// Convenience helpers.

export function isSeed(cardId: CardId): boolean {
  return getCard(cardId).type === 'seed';
}

export function isTool(cardId: CardId): boolean {
  return getCard(cardId).type === 'tool';
}

export function asSeed(cardId: CardId): SeedCard {
  const c = getCard(cardId);
  if (c.type !== 'seed') throw new Error(`Expected seed, got ${cardId}`);
  return c;
}

export function asTool(cardId: CardId): ToolCard {
  const c = getCard(cardId);
  if (c.type !== 'tool') throw new Error(`Expected tool, got ${cardId}`);
  return c;
}
