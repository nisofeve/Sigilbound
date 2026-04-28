import Phaser from 'phaser';
import {
  SeasonRunner,
  defaultSeasonConfig,
  getCard,
  getPerk,
  type CardId,
  type Grade,
  type Perk,
  type RunEvent,
  type RunResult,
  type SeedCard,
  type ToolCard,
} from '@engine/index';
import { ActiveModifiersPanel, computeActiveModifiers } from './panels/ActiveModifiersPanel';
import { RoundTimelinePanel } from './panels/RoundTimelinePanel';
import { OrderCardsPanel } from './panels/OrderCardsPanel';
import { ComboLegendPanel } from './panels/ComboLegendPanel';
import { EquippedPerksPanel } from './panels/EquippedPerksPanel';
import type { EventCard } from '@engine/index';
import { sfx } from './sfx';

// === Animation durations (matching GDD §Card Animation spec) ===
const ANIM = {
  drawArc: 280,
  reFan: 320,
  drop: 280,
  invalidSnap: 220,
  growBounce: 320,
  readyGlow: 360,
  harvestFly: 460,
  comboPop: 800,
  roundLabel: 700,
};

// === Responsive layout config ===
// Computed once at scene init from viewport size. Mobile/portrait gets compacted
// dimensions and a horizontal modifiers strip; landscape uses the wider desktop layout.

interface LayoutCfg {
  isMobile: boolean;
  cardW: number;
  cardH: number;
  cardScale: number;       // hover lift uses this; drop/drag use 1.06× of base
  plotSize: number;
  plotGap: number;
  plotRows: number;        // for 4+ plots on narrow screens we wrap into 2 rows
  hudH: number;
  footerH: number;
  handFanDeg: number;
  modPanelLayout: 'vertical' | 'horizontal';
  modPanelChipsCompact: boolean;
}

function makeLayout(width: number, height: number, plotCount: number): LayoutCfg {
  const isMobile = width < 720 || height > width * 1.1;
  if (isMobile) {
    // Choose plot size that fits the viewport with margins and optional row wrapping.
    let cols = plotCount;
    let plotSize = 96;
    let gap = 10;
    const maxRowW = width - 16;
    while (cols * plotSize + (cols - 1) * gap > maxRowW && plotSize > 60) {
      plotSize -= 4;
    }
    let rows = 1;
    if (plotCount >= 5) {
      cols = Math.ceil(plotCount / 2);
      rows = 2;
      plotSize = Math.min(96, Math.floor((maxRowW - (cols - 1) * gap) / cols));
    }
    return {
      isMobile: true,
      cardW: 83,
      cardH: 117,
      cardScale: 1.0,
      plotSize: Math.max(plotSize, 60),
      plotGap: gap,
      plotRows: rows,
      hudH: 44,
      footerH: 72,
      handFanDeg: 5,
      modPanelLayout: 'horizontal',
      modPanelChipsCompact: true,
    };
  }
  return {
    isMobile: false,
    cardW: 125,
    cardH: 174,
    cardScale: 1.0,
    plotSize: 132,
    plotGap: 18,
    plotRows: 1,
    hudH: 56,
    footerH: 90,
    handFanDeg: 4,
    modPanelLayout: 'vertical',
    modPanelChipsCompact: false,
  };
}

interface SceneInit {
  seed: number;
  perkIds: string[];
  ownedUpgradeIds: string[];
  customDeck: string[];
  customDeckGrades: string[];
  ownedCardIds: string[];
  chosenOrders: import('@engine/index').OrderCard[];
  // Stage being played, if any. Forwarded into SeasonConfig so RunResult
  // carries it through to the post-run flow.
  stageNumber: number | null;
  onSeasonEnd: (result: RunResult) => void;
  onDraftRequest: (cards: CardId[]) => void;
  isPvp?: boolean;
}

interface CardVisual {
  container: Phaser.GameObjects.Container;
  cardId: CardId;
}

interface PlotVisual {
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  cropText: Phaser.GameObjects.Text;
  growBar: Phaser.GameObjects.Rectangle;
  growBarBg: Phaser.GameObjects.Rectangle;
  zone: Phaser.Geom.Rectangle;
}

export class GameScene extends Phaser.Scene {
  private runner!: SeasonRunner;
  private onSeasonEnd!: (result: RunResult) => void;
  private onDraftRequest!: (cards: CardId[]) => void;
  private equippedPerks: Perk[] = [];
  private isPvp = false;

  // Visuals.
  private hand: CardVisual[] = [];
  private plots: PlotVisual[] = [];
  private hudRound!: Phaser.GameObjects.Text;
  private hudCoins!: Phaser.GameObjects.Text;
  private hudLoyal!: Phaser.GameObjects.Text;
  private hudDeck!: Phaser.GameObjects.Text;
  private hudDiscard!: Phaser.GameObjects.Text;
  // Hand-size counter shown just below the hand row: "5 / 5".
  private handCounter!: Phaser.GameObjects.Text;
  private endRoundBtn!: Phaser.GameObjects.Container;
  private deckPile!: Phaser.GameObjects.Container;
  private inputLocked = false;
  private inspector: Phaser.GameObjects.Container | null = null;
  private modifiersPanel!: ActiveModifiersPanel;
  private timelinePanel!: RoundTimelinePanel;
  private ordersPanel!: OrderCardsPanel;
  // Reference held so the panel survives scene re-renders. Kept on `this`
  // (not a local) so future cleanup hooks can call `comboLegend.destroy()`.
  private comboLegend?: ComboLegendPanel;
  private perksLegend?: EquippedPerksPanel;
  // On mobile portrait, perks + combos render as horizontal strips at the
  // top of the play area. This is the total vertical height they consume so
  // the layout getter can push the orders panel + plots down past them.
  private mobileRailBlockH = 0;
  // Vertical space the orders strip occupies on mobile portrait (cardH +
  // small breathing space). Cached so the layout getter knows how far
  // down to push the plot grid + hand for any orderCardW that fits.
  private mobileOrdersBlockH = 0;
  // Per-round event history for the timeline tooltips. Visual-only — engine
  // remains the source of truth, this just remembers what fired so the player
  // can scroll back to past rounds.
  private eventHistory = new Map<number, EventCard>();
  private cfg!: LayoutCfg;

  // Discard-mode state. When the hand overflows the cap (cascade draws, tool
  // draws, etc.) the scene enters discard mode: all hand cards shake, and the
  // player must pick `discardRequired` cards before the game proceeds.
  private discardMode = false;
  private discardRequired = 0;
  private discardSelected = new Set<number>();      // hand indices currently selected
  private discardShakeTweens: Phaser.Tweens.Tween[] = [];
  private discardOverlay: Phaser.GameObjects.Container | null = null;
  private discardCounterText: Phaser.GameObjects.Text | null = null;
  private discardButtonBg: Phaser.GameObjects.Rectangle | null = null;
  private discardButtonLabel: Phaser.GameObjects.Text | null = null;
  private deferredAfterDiscard: (() => void) | null = null;

  // Counter of in-flight draw arcs. While > 0, hand cards reject hover/drag/
  // tap so the player can't interact with cards that are still mid-flight.
  private drawingCount = 0;

  // Index of the plot currently highlighted as a drop target during drag.
  // -1 means no plot is being highlighted.
  private hoveredDropPlotIndex = -1;

  constructor() {
    super('GameScene');
  }

  // Patch this scene's text factory so every Text rasterizes at devicePixelRatio,
  // killing the blur on retina / 4K monitors. Phaser's default canvas backing store
  // is 1× regardless of DPR, so text bitmaps look soft when the browser stretches
  // the canvas to the screen's real pixels. Setting Text.resolution makes Phaser
  // render the text glyphs at higher fidelity into the same display footprint.
  private installCrispText() {
    const dpr = Math.min(3, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
    if (dpr <= 1) return;
    const factory = this.add;
    const original = factory.text.bind(factory);
    factory.text = ((
      x: number,
      y: number,
      text: string | string[],
      style?: Phaser.Types.GameObjects.Text.TextStyle,
    ) => original(x, y, text, style).setResolution(dpr)) as typeof factory.text;
  }

  init(data?: Partial<SceneInit>) {
    // Guard against being started without our data payload (e.g. if Phaser ever
    // auto-starts the scene). create() also bails out if runner isn't set.
    if (!data || !data.onSeasonEnd || !data.onDraftRequest || !data.perkIds || !data.ownedUpgradeIds || data.seed === undefined) {
      return;
    }
    this.onSeasonEnd = data.onSeasonEnd;
    this.onDraftRequest = data.onDraftRequest;
    this.isPvp = data.isPvp ?? false;
    this.equippedPerks = data.perkIds.map(getPerk);
    const customDeck = (data.customDeck ?? []) as CardId[];
    const customDeckGrades = (data.customDeckGrades ?? []) as Grade[];
    const ownedCardIds = (data.ownedCardIds ?? []) as CardId[];
    const chosenOrders = data.chosenOrders ?? [];
    const cfg = defaultSeasonConfig(data.seed, {
      perks: this.equippedPerks,
      ownedUpgradeIds: data.ownedUpgradeIds,
      customDeck: customDeck.length > 0 ? customDeck : undefined,
      customDeckGrades: customDeckGrades.length > 0 ? customDeckGrades : undefined,
      ownedCardIds: ownedCardIds.length > 0 ? ownedCardIds : undefined,
      chosenOrders: chosenOrders.length > 0 ? chosenOrders : undefined,
      stageNumber: data.stageNumber ?? undefined,
    });
    this.runner = new SeasonRunner(cfg, { ownedUpgradeIds: data.ownedUpgradeIds });
  }

  // Called by React after the player resolves a draft modal.
  applyDraftChoice(cardId: CardId | null): void {
    if (!this.runner) return;
    this.inputLocked = false;
    this.resetCardGestureState();

    const action = cardId
      ? ({ kind: 'draft_pick', cardId } as const)
      : ({ kind: 'draft_skip' } as const);
    const events = this.runner.apply(action);

    // Sync visible state to the engine immediately. Animations are decoration.
    this.syncSceneToEngine();
    this.pulseHandReady();

    void (async () => {
      try {
        await this.playEventQueue(events);
      } catch (err) {
        console.warn('[applyDraftChoice] event queue failed:', err);
      } finally {
        this.syncSceneToEngine(true);
        // Recheck overflow after the safety-net sync, since `addMissingHand`
        // can add cards that weren't yet drawn by the queue (e.g., a draft +
        // cascade refill where a card_drawn event silently dropped). Without
        // this re-check the discard prompt would never appear in round 4+
        // when the queue had a stutter.
        this.checkHandOverflow();
        this.maybeFinish();
      }
    })();
  }

  // Cue the player that the round is live: every hand card briefly bounces in unison.
  private pulseHandReady() {
    if (this.hand.length === 0) return;
    for (let i = 0; i < this.hand.length; i++) {
      const c = this.hand[i].container;
      this.tweens.add({
        targets: c,
        y: { from: c.y + 8, to: c.y },
        duration: 220,
        ease: 'Cubic.out',
        delay: i * 35,
      });
    }
  }

  // Reset every hand card's per-gesture state and re-assert interactivity. Cheap
  // and idempotent — safe to call any time we suspect Phaser's pointer state has
  // drifted (e.g., after a DOM modal closed).
  private resetCardGestureState(): void {
    for (const visual of this.hand) {
      visual.container.setData('didDrag', false);
      visual.container.setInteractive({ useHandCursor: true, draggable: true });
    }
  }

  // === Engine ↔ scene sync ===
  // The engine is the source of truth. Animations are decoration. After any
  // engine state change we call syncSceneToEngine() to bring the visible state
  // into agreement immediately — that way, even if a tween silently fails to
  // fire onComplete, the game *looks* and *plays* correctly. The animation
  // queue running in the background is just polish on top.

  // `addMissingHand` controls whether the hand-sync also creates visuals for
  // engine cards that have no corresponding visual. Default is FALSE because
  // most callers run sync BEFORE the deferred event queue plays — the queue's
  // `card_drawn` events are responsible for drawing new cards with their arc
  // animation. Pass TRUE only after the queue has finished, as a safety net
  // for any draws that the queue silently failed to deliver. Skipped while the
  // player is in discard mode — adding cards then would bypass the lift/shake
  // staging and confuse the selection state.
  // `skipPlotIndices` lets the caller protect plots whose harvest animation is
  // about to play — clearing their cropText eagerly would erase the crop
  // before the player saw it lift off.
  private syncSceneToEngine(addMissingHand = false, skipPlotIndices?: Set<number>): void {
    // Each helper is wrapped so one failing piece (e.g. unknown cardId in a
    // plot) doesn't abort the others. Best-effort visual sync.
    try { this.refreshHud(); } catch (e) { console.warn('[sync] refreshHud failed:', e); }
    try { this.modifiersPanel.refresh(computeActiveModifiers(this.runner.state)); } catch (e) { console.warn('[sync] modifiers failed:', e); }
    try { this.syncPlotsToEngine(skipPlotIndices); } catch (e) { console.warn('[sync] plots failed:', e); }
    const allowAdd = addMissingHand && !this.discardMode;
    try { this.syncHandToEngine(allowAdd); } catch (e) { console.warn('[sync] hand failed:', e); }
    try { this.refreshTimeline(); } catch (e) { console.warn('[sync] timeline failed:', e); }
    try { this.ordersPanel?.refresh(this.runner.state.orders); } catch (e) { console.warn('[sync] orders failed:', e); }
  }

  private refreshTimeline(): void {
    if (!this.timelinePanel || !this.runner) return;
    this.timelinePanel.refresh({
      totalRounds: this.runner.state.totalRounds,
      draftRounds: this.runner.config.draftRounds,
      history: this.eventHistory,
      currentRound: this.runner.state.round,
    });
  }

  private syncPlotsToEngine(skipIndices?: Set<number>): void {
    // Plot count drift: Silver Hoe pushes a temp plot, the engine later
    // splices it out. Rebuild the entire row on mismatch so drag zones,
    // hover handlers, and per-plot indices line up with the engine truth.
    if (this.plots.length !== this.runner.state.plots.length) {
      this.rebuildPlotsToMatchEngine();
    }
    for (let i = 0; i < this.plots.length; i++) {
      // Skip plots whose harvest animation is about to play — clearing them
      // here would erase the crop image before the lift-off animation runs.
      if (skipIndices?.has(i)) continue;
      const visual = this.plots[i];
      const state = this.runner.state.plots[i];
      // Reset any temporary depth bump from the harvest animation, and undo
      // the harvest "hide the original cropText so the flyer reads as the
      // crop itself" trick when state moves on (plot becomes empty or new
      // crop is planted later).
      visual.container.setDepth(0);
      visual.cropText.setVisible(true);
      if (state.kind === 'empty') {
        visual.cropText.setText('').setAlpha(1);
        visual.bg.setFillStyle(0x5a3a20, 0.7);
        visual.bg.setStrokeStyle(2, 0x6ab47b, 0.55);
      } else {
        const card = getCard(state.crop.cardId);
        if (card.type === 'seed') visual.cropText.setText(card.emoji).setAlpha(1);
        // Plot bg stays brown soil regardless of ripeness — readiness is now
        // signalled by a thick gold stroke instead of a gold fill, so the crop
        // image is never visually swallowed by the overlay.
        visual.bg.setFillStyle(0x5a3a20, 0.7);
        if (state.kind === 'ready') {
          visual.bg.setStrokeStyle(4, 0xffd54f, 1);
        } else {
          visual.bg.setStrokeStyle(2, 0x6ab47b, 0.55);
        }
      }
      this.refreshGrowBar(i);
    }
  }

  // `addMissing` controls whether this sync also creates visuals for engine
  // cards that have no visual yet. We almost never want this during the eager
  // pre-queue sync — the deferred `card_drawn` events in the queue will draw
  // them with their proper arc animation. Adding them eagerly here would
  // produce a duplicate (one snapped in instantly, one arcing in afterwards).
  // The queue-completion fallback path passes addMissing=true so any cards a
  // failed event silently skipped still end up on screen.
  private syncHandToEngine(addMissing = false): void {
    const engineHand = this.runner.state.hand;
    const targetLen = engineHand.length;

    // 1. REMOVE stale visuals — visuals that exist in this.hand but no longer
    //    correspond to engine cards. This happens when the engine silently
    //    splices its own hand without emitting events the visual layer can
    //    react to (Garden Fork: discard 2 random; Seed Vault duplication
    //    timing; etc.). Walk from the end and destroy any visual whose cardId
    //    doesn't match what the engine has at that index.
    let safetyRemove = 0;
    while (this.hand.length > targetLen && safetyRemove++ < 30) {
      const stale = this.hand.pop();
      if (stale) {
        this.tweens.killTweensOf(stale.container);
        stale.container.destroy();
      }
    }
    // Also fix per-index mismatches (e.g. engine spliced from middle).
    for (let i = 0; i < this.hand.length && i < targetLen; i++) {
      if (this.hand[i].cardId !== engineHand[i]) {
        // Mismatch at index i — purge from here and let the add-loop below
        // rebuild from engine state.
        for (let j = this.hand.length - 1; j >= i; j--) {
          const stale = this.hand[j];
          this.tweens.killTweensOf(stale.container);
          stale.container.destroy();
        }
        this.hand.length = i;
        break;
      }
    }

    // 2. ADD missing visuals (only when explicitly requested, see comment above).
    if (!addMissing) return;
    let safety = 0;
    while (this.hand.length < targetLen && safety++ < 30) {
      const before = this.hand.length;
      const cardId = engineHand[before];
      try {
        void this.addHandCard(cardId, this.deckPile.x, this.deckPile.y, false);
      } catch (err) {
        console.warn('[syncHandToEngine] addHandCard threw:', cardId, err);
        break;
      }
      if (this.hand.length === before) {
        console.warn('[syncHandToEngine] addHandCard did not push:', cardId);
        break;
      }
    }
    this.refanHand();
  }

  private maybeFinish() {
    if (this.runner.phase !== 'season_end') return;
    this.lockInput();
    const result = this.runner.state;
    // Market Bell early-end path. Mirror the order-failure penalty logic
    // from SeasonRunner.buildResult: if any order was left unfulfilled the
    // run is a fail and the player only keeps 20% of their earnings.
    const hasOrders = result.orders.length > 0;
    const ordersAllFulfilled = !hasOrders || result.orders.every(o => o.fulfilled);
    const finalCoins = (hasOrders && !ordersAllFulfilled)
      ? Math.floor(result.coins * 0.2)
      : result.coins;
    const rating: 'fail' | 'survive' | 'bronze' | 'silver' | 'gold' | 'mythic' =
      (hasOrders && !ordersAllFulfilled) ? 'fail'
        : finalCoins >= 2500 ? 'mythic'
        : finalCoins >= 1000 ? 'gold'
        : finalCoins >= 500  ? 'silver'
        : finalCoins >= 200  ? 'bronze'
        : 'survive';
    this.time.delayedCall(500, () =>
      this.onSeasonEnd({
        finalCoins,
        rounds: result.totalRounds,
        combosTotal: result.combosTotal,
        rating,
        orders: result.orders.map(o => ({
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
      }),
    );
  }

  create() {
    // Defensive: only build the scene if init() received its data payload.
    if (!this.runner) return;
    this.installCrispText();
    // Tear down lingering panels on scene shutdown so a re-mounted run
    // (Play Again) doesn't end up with two combo-legend instances stacked
    // on top of each other.
    this.events.once('shutdown', () => {
      this.comboLegend?.destroy();
      this.perksLegend?.destroy();
    });
    this.cfg = makeLayout(this.scale.width, this.scale.height, this.runner.state.plots.length);
    // Camera background — a base earth-brown. The scenery layer painted by
    // buildBackdrop() draws the tilled-field pattern over it. Top-down view
    // so the plots feel like patches of soil sitting on the same ground.
    this.cameras.main.setBackgroundColor(0x4a3621);
    this.buildBackdrop();
    this.buildHud();
    this.buildPlots();
    this.buildPiles();
    this.buildEndRoundButton();
    this.buildHandCounter();
    // Round timeline panel: vertical column hugging the left edge. Tells the
    // player where they are in the season and what's coming next.
    const timelineX = this.cfg.isMobile ? 26 : 32;
    const timelineY = this.cfg.hudH + 24;
    const timelineMaxH = this.scale.height - timelineY - this.cfg.footerH - 80;
    this.timelinePanel = new RoundTimelinePanel(this, timelineX, timelineY, {
      compact: this.cfg.isMobile,
      maxHeight: timelineMaxH,
    });
    this.refreshTimeline();

    // Active modifiers panel: left rail on desktop (shifted right to clear the
    // timeline column), top horizontal strip on mobile (also shifted right).
    // Gutter sized to the doubled timeline (node + number badge + chevron).
    const timelineGutter = this.cfg.isMobile ? 80 : 100;
    const panelX = this.cfg.modPanelLayout === 'vertical'
      ? 12 + timelineGutter
      : 8 + timelineGutter;
    const panelY = this.cfg.modPanelLayout === 'vertical' ? this.cfg.hudH + 12 : this.cfg.hudH + 4;
    this.modifiersPanel = new ActiveModifiersPanel(this, panelX, panelY, {
      layout: this.cfg.modPanelLayout,
      compact: this.cfg.modPanelChipsCompact,
      maxWidth: this.scale.width - 16 - timelineGutter,
    });
    this.modifiersPanel.primeSilent();
    this.modifiersPanel.refresh(computeActiveModifiers(this.runner.state));

    // On mobile portrait, the perks + combos rails render as horizontal
    // strips at the top of the play area. Probe their combined height now
    // so the orders panel + plots can be pushed down past them.
    if (this.cfg.isMobile) {
      const probeCombo = new ComboLegendPanel(this, 0, 0, { compact: true, orientation: 'horizontal' });
      const comboH = probeCombo.totalHeight();
      probeCombo.destroy();
      let perksH = 0;
      if (this.equippedPerks.length > 0) {
        const probePerks = new EquippedPerksPanel(this, 0, 0, this.equippedPerks, { compact: true, orientation: 'horizontal' });
        perksH = probePerks.totalHeight();
        probePerks.destroy();
      }
      const stackGap = 4;
      this.mobileRailBlockH = perksH > 0 ? perksH + stackGap + comboH + 6 : comboH + 6;
    } else {
      this.mobileRailBlockH = 0;
    }

    // Orders panel: row of objective cards above the plots. On mobile
    // portrait we render the compact CHIP layout — small horizontal pills
    // — so they don't eat half the play area or overlap the round timeline
    // on the left rail. Tap any chip to reveal the full tooltip with
    // story, remark, and objective.
    const useChip = this.cfg.isMobile;
    // Mobile: render orders as small PORTRAIT cards that mirror the
    // player's hand cards (same aspect ratio + visual chrome). Tap to
    // open the full tooltip. The chip size baselines off the player's
    // hand card so all cards on screen share a visual size language.
    const orderGap = useChip ? 6 : 18;
    const handCardW = this.cfg.cardW;
    const handCardH = this.cfg.cardH;
    // Doubled from the prior 75%-of-a-hand-card target — orders now read
    // as the *primary* objective at ~150% of a hand card. The fit-shrink
    // pass below will still squeeze them down when many orders need to
    // share the row on a narrow phone.
    const baseOrderW = useChip ? Math.round(handCardW * 1.5) : 220;
    const orderAspect = handCardH / handCardW; // ≈ 1.41 to match hand cards
    let orderCardW = baseOrderW;
    let orderCenterX = this.scale.width / 2;
    if (useChip) {
      const count = Math.max(1, this.runner.state.orders.length);
      const leftEdge = timelineGutter + 8;
      const rightEdge = this.scale.width - 8;
      const available = rightEdge - leftEdge;
      const fitW = Math.floor((available - (count - 1) * orderGap) / count);
      // Allow squeezing as low as 60 px wide so 5 boss-stage orders fit
      // on a 360 px phone — the type sizing in OrderCardsPanel scales
      // off cardH, so it stays legible even at the smallest size.
      orderCardW = Math.max(60, Math.min(baseOrderW, fitW));
      orderCenterX = leftEdge + (count * orderCardW + (count - 1) * orderGap) / 2;
    }
    const orderCardH = useChip ? Math.round(orderCardW * orderAspect) : 320;
    // Cache so the layout getter pushes plots/hand down by the actual
    // orders height rather than the previous 44 px hardcoded chip height.
    this.mobileOrdersBlockH = useChip ? orderCardH + 12 : 0;
    const orderY = this.cfg.hudH + (this.cfg.modPanelLayout === 'horizontal' ? 60 : 34) + this.mobileRailBlockH + orderCardH / 2;
    this.ordersPanel = new OrderCardsPanel(this, orderCenterX, orderY, {
      y: orderY,
      cardW: orderCardW,
      cardH: orderCardH,
      gap: orderGap,
      compact: useChip,
      layout: useChip ? 'chip' : 'full',
    });
    this.ordersPanel.refresh(this.runner.state.orders);

    // Combo legend — vertical chips on the right edge of the play area.
    // Always-visible reminder of the 3 combo conditions; hover/tap reveals
    // the full scoring breakdown. Positioned outside the plot grid so it
    // doesn't compete for the player's attention while planting.
    {
      // Both panels share the SideRailPanel widget. Their containers are
      // CENTER-anchored and `totalHeight()` / `totalWidth()` return the full
      // backing-strip extent — so positioning math is just "stack the centers".
      const compact = this.cfg.isMobile;

      if (this.cfg.isMobile) {
        // Mobile portrait: render as horizontal strips below the modifiers
        // panel so the narrow side gutters stay clear for the play area.
        // Perks strip sits ABOVE the combos strip when present.
        const orientation = 'horizontal' as const;
        const tempCombo = new ComboLegendPanel(this, 0, 0, { compact, orientation });
        const comboH = tempCombo.totalHeight();
        tempCombo.destroy();

        let perksH = 0;
        if (this.equippedPerks.length > 0) {
          const tempPerks = new EquippedPerksPanel(this, 0, 0, this.equippedPerks, { compact, orientation });
          perksH = tempPerks.totalHeight();
          tempPerks.destroy();
        }

        const stripTop = this.cfg.hudH + (this.cfg.modPanelLayout === 'horizontal' ? 56 : 30);
        const stackGap = 4;
        if (perksH > 0) {
          const perksCenterX = this.scale.width / 2;
          const perksCenterY = stripTop + perksH / 2;
          this.perksLegend = new EquippedPerksPanel(this, perksCenterX, perksCenterY, this.equippedPerks, { compact, orientation });
        }
        const comboCenterX = this.scale.width / 2;
        const comboCenterY = stripTop + (perksH > 0 ? perksH + stackGap : 0) + comboH / 2;
        this.comboLegend = new ComboLegendPanel(this, comboCenterX, comboCenterY, { compact, orientation });
      } else {
        const tempCombo = new ComboLegendPanel(this, 0, 0, { compact });
        const comboW = tempCombo.totalWidth();
        const comboH = tempCombo.totalHeight();
        tempCombo.destroy();

        let perksH = 0;
        if (this.equippedPerks.length > 0) {
          const tempPerks = new EquippedPerksPanel(this, 0, 0, this.equippedPerks, { compact });
          perksH = tempPerks.totalHeight();
          tempPerks.destroy();
        }

        const margin = 12;
        const railX = this.scale.width - margin - comboW / 2;

        const stackGap = 12;
        const totalRailH = perksH > 0 ? perksH + stackGap + comboH : comboH;
        const { plotsY, plotsTotalH } = this.layout;
        const plotsCenterY = plotsY + plotsTotalH / 2;
        const minTop = this.cfg.hudH + 16;
        const maxTop = this.scale.height - this.cfg.footerH - 16 - totalRailH;
        const railTop = Math.max(minTop, Math.min(maxTop, plotsCenterY - totalRailH / 2));

        if (perksH > 0) {
          const perksCenterY = railTop + perksH / 2;
          this.perksLegend = new EquippedPerksPanel(this, railX, perksCenterY, this.equippedPerks, { compact });
        }
        const comboCenterY = railTop + (perksH > 0 ? perksH + stackGap : 0) + comboH / 2;
        this.comboLegend = new ComboLegendPanel(this, railX, comboCenterY, { compact });
      }
    }

    // Animate the opening (round 1 setup): show round label, then fly in the starting hand.
    const opening = this.runner.consumeOpeningEvents();
    void this.playEventQueue(opening);
    this.refreshHud();
  }

  // === Layout ===

  private get layout() {
    const { width, height } = this.scale;
    const cols = Math.ceil(this.runner.state.plots.length / this.cfg.plotRows);
    const plotsTotalW = cols * this.cfg.plotSize + (cols - 1) * this.cfg.plotGap;
    const plotsTotalH = this.cfg.plotRows * this.cfg.plotSize + (this.cfg.plotRows - 1) * this.cfg.plotGap;
    const plotsX = width / 2 - plotsTotalW / 2;
    // Push plot grid down to leave room for HUD + modifiers strip on mobile,
    // PLUS the orders panel directly above the plots. On mobile the orders
    // strip is now small portrait cards sized off the player's hand-card
    // dimensions — actual height is cached in `mobileOrdersBlockH` after
    // the panel was constructed.
    const ordersBlock = this.cfg.isMobile
      ? (this.mobileOrdersBlockH > 0 ? this.mobileOrdersBlockH : Math.round(this.cfg.cardW * 1.5 * 1.41) + 12)
      : 320 + 16;
    const topReserved = (this.cfg.modPanelLayout === 'horizontal' ? this.cfg.hudH + 56 : this.cfg.hudH + 30) + this.mobileRailBlockH + ordersBlock;
    const handY = height - this.cfg.footerH - 42;
    // Vertically center plots in the space between top reserved and hand.
    const playArea = handY - topReserved - this.cfg.cardH / 2 - 12;
    const plotsY = topReserved + Math.max(0, (playArea - plotsTotalH) / 2);
    return { width, height, plotsTotalW, plotsTotalH, plotsX, plotsY, handY };
  }

  // Top-down farmland backdrop — pure shape graphics, no asset files.
  // Composition: dark earth base + a regular GRID overlay (suggesting a
  // tilled-plot layout) + a sprinkling of small grass tufts placed at
  // pseudo-random positions for natural variation. Drawn at depth -100 so
  // every gameplay element renders on top.
  private buildBackdrop() {
    const { width, height } = this.scale;
    const layer = this.add.container(0, 0).setDepth(-100);

    // Base soil — a single dark earth wash covering the entire scene.
    const baseSoil = this.add.rectangle(0, 0, width, height, 0x5a3a20, 1).setOrigin(0, 0);
    layer.add(baseSoil);

    // Grid overlay — thin darker lines spaced regularly, evoking a tilled
    // plot grid. Sized so a typical viewport shows ~14 columns × ~10 rows;
    // adjusts proportionally on bigger / smaller screens. Two-pass: every
    // 4th line gets a slightly thicker / darker stroke so the grid reads
    // as "major plot boundaries / minor furrows".
    const gridStep = Math.max(40, Math.round(Math.min(width, height) / 14));
    const gridColor = 0x3a2510;
    const minorAlpha = 0.22;
    const majorAlpha = 0.38;
    // Vertical lines.
    let col = 0;
    for (let x = gridStep; x < width; x += gridStep) {
      const isMajor = col % 4 === 3;
      const w = isMajor ? 2 : 1;
      const a = isMajor ? majorAlpha : minorAlpha;
      const line = this.add.rectangle(x, 0, w, height, gridColor, a).setOrigin(0, 0);
      layer.add(line);
      col++;
    }
    // Horizontal lines.
    let row = 0;
    for (let y = gridStep; y < height; y += gridStep) {
      const isMajor = row % 4 === 3;
      const h = isMajor ? 2 : 1;
      const a = isMajor ? majorAlpha : minorAlpha;
      const line = this.add.rectangle(0, y, width, h, gridColor, a).setOrigin(0, 0);
      layer.add(line);
      row++;
    }

    // Scattered grass tufts — small clumps of green at pseudo-random
    // grid-cell positions. Deterministic seed so the same scene always
    // gets the same layout (no flicker on re-render). Tufts skip cells
    // close to the screen center where the play area lives so they don't
    // visually interfere with cards / plots.
    const tufts = 28;
    const cx = width / 2;
    const cy = height / 2;
    const safeRadius = Math.min(width, height) * 0.28;
    for (let t = 0; t < tufts; t++) {
      // Mulberry-ish hash for px, py, size, color jitter.
      const seed = (t * 2654435761 + 0x9e3779b9) >>> 0;
      const px = ((seed >>> 0) % 1000) / 1000;
      const py = (((seed >> 8) >>> 0) % 1000) / 1000;
      const xWorld = px * width;
      const yWorld = py * height;
      // Skip the central play area so tufts don't sit under cards.
      if (Math.hypot(xWorld - cx, yWorld - cy) < safeRadius) continue;
      const size = 6 + (((seed >> 16) >>> 0) % 5);   // 6–10 px
      const greenSeed = (seed >> 20) & 0x3;
      const color = [0x6a9b3a, 0x7eaf45, 0x5d8a32, 0x73a73c][greenSeed];
      // A tuft is 3 small overlapping circles — simulates blades of grass.
      for (let b = 0; b < 3; b++) {
        const ox = ((b - 1) * size * 0.6);
        const oy = (b === 1 ? -size * 0.3 : 0);
        const blade = this.add.circle(xWorld + ox, yWorld + oy, size * 0.55, color, 0.7);
        layer.add(blade);
      }
    }
  }

  private buildHud() {
    const { width } = this.scale;
    // Wooden HUD bar — brown gradient with a darker bottom rim and a thin
    // gold underline. Mirrors the main-menu wood-frame panel feel.
    const bg = this.add.rectangle(0, 0, width, this.cfg.hudH, 0x4a321b, 0.92).setOrigin(0, 0).setScrollFactor(0);
    bg.setStrokeStyle(2, 0x6d4c2a, 1);
    bg.setData('hud', true);
    // Thin gold accent line just under the bar — the same sun-gold that
    // marks "active" things across the menu screens.
    const accent = this.add.rectangle(0, this.cfg.hudH, width, 2, 0xffd54f, 0.9).setOrigin(0, 0).setScrollFactor(0);
    accent.setData('hud', true);

    const fontSize = this.cfg.isMobile ? '12px' : '14px';
    const style = (color: string) => ({
      fontFamily: 'Nunito, sans-serif',
      fontSize,
      color,
      fontStyle: 'bold',
    } as Phaser.Types.GameObjects.Text.TextStyle);

    if (this.cfg.isMobile) {
      // Compact single-line HUD on mobile: round | coins | loyal | deck | discard.
      this.hudRound = this.add.text(8, this.cfg.hudH / 2, '', style('#ffffff')).setOrigin(0, 0.5);
      this.hudCoins = this.add.text(width / 2, this.cfg.hudH / 2, '', style('#ffe082')).setOrigin(0.5, 0.5);
      this.hudLoyal = this.add.text(width - 8, this.cfg.hudH / 2, '', style('#f8bbd0')).setOrigin(1, 0.5);
      // Deck & discard chips not worth showing in the tight mobile HUD; piles at the
      // bottom of the screen still convey the same information visually.
      this.hudDeck = this.add.text(0, 0, '', style('#a5d6a7')).setOrigin(1, 0.5).setVisible(false);
      this.hudDiscard = this.add.text(0, 0, '', style('#bcaaa4')).setOrigin(1, 0.5).setVisible(false);
    } else {
      this.hudRound = this.add.text(16, this.cfg.hudH / 2, '', style('#ffffff')).setOrigin(0, 0.5);
      this.hudCoins = this.add.text(width / 2, this.cfg.hudH / 2, '', style('#ffe082')).setOrigin(0.5, 0.5);
      this.hudLoyal = this.add.text(width - 16, this.cfg.hudH / 2 - 10, '', style('#f8bbd0')).setOrigin(1, 0.5);
      this.hudDeck = this.add.text(width - 16, this.cfg.hudH / 2 + 8, '', style('#a5d6a7')).setOrigin(1, 0.5);
      this.hudDiscard = this.add.text(width - 100, this.cfg.hudH / 2 + 8, '', style('#bcaaa4')).setOrigin(1, 0.5);
    }
  }

  // Small "current / max" hand-size readout pinned just below the hand row.
  // Turns amber when the hand is at cap and red when over (discard-mode pending).
  private buildHandCounter() {
    const { width } = this.scale;
    // Sit below the cards: handY is the card center, so add half the card height
    // plus some padding for the readout to clear the bottom of the cards.
    const y = this.layout.handY + this.cfg.cardH / 2 + 14;
    this.handCounter = this.add.text(width / 2, y, '', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: this.cfg.isMobile ? '13px' : '15px',
      color: '#ffffff',
      stroke: '#1b3a1f',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(70);
  }

  private buildPlots() {
    const plotCount = this.runner.state.plots.length;
    for (let i = 0; i < plotCount; i++) {
      this.plots.push(this.makePlotVisual(i));
    }
  }

  // Rebuild the entire plot row so positions match the current engine layout.
  // Called when the plot count changes (Silver Hoe adds a temp plot, or the
  // temp plot expires) — without this, dragged cards wouldn't hit the new
  // plot's zone and syncPlotsToEngine would silently truncate.
  private rebuildPlotsToMatchEngine(): void {
    for (const p of this.plots) {
      try { this.tweens.killTweensOf(p.container); } catch { /* tween may already be dead */ }
      p.container.destroy();
    }
    this.plots = [];
    this.buildPlots();
  }

  // Construct one plot visual at engine index `i`. Position is read from
  // the live layout so reflowing on count changes Just Works™.
  private makePlotVisual(i: number): PlotVisual {
    const { plotsX, plotsY } = this.layout;
    const plotCount = Math.max(1, this.runner.state.plots.length);
    const cols = Math.ceil(plotCount / this.cfg.plotRows);
    const cropEmojiSize = Math.round(this.cfg.plotSize * 0.4);
    const barInset = Math.max(12, this.cfg.plotSize * 0.18);
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = plotsX + col * (this.cfg.plotSize + this.cfg.plotGap);
    const y = plotsY + row * (this.cfg.plotSize + this.cfg.plotGap);
    const container = this.add.container(x + this.cfg.plotSize / 2, y + this.cfg.plotSize / 2);

    const bg = this.add.rectangle(0, 0, this.cfg.plotSize, this.cfg.plotSize, 0x5a3a20, 0.7);
    bg.setStrokeStyle(2, 0x6ab47b, 0.55);
    container.add(bg);

    const plotIndex = i;
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => {
      if (this.inputLocked) return;
      if (this.runner.state.plots[plotIndex]?.kind === 'empty') return;
      this.showPlotInspector(plotIndex);
      if (this.runner.state.plantedThisRound.includes(plotIndex)) {
        bg.setStrokeStyle(2.5, 0xfff176, 0.95);
      }
    });
    bg.on('pointerout', () => {
      this.hideInspector();
      if (this.runner.state.plots[plotIndex]?.kind === 'ready') {
        bg.setStrokeStyle(4, 0xffd54f, 1);
      } else {
        bg.setStrokeStyle(2, 0x6ab47b, 0.55);
      }
    });
    bg.on('pointerdown', () => {
      if (this.inputLocked) return;
      if (!this.runner.state.plantedThisRound.includes(plotIndex)) return;
      this.handleUndoPlant(plotIndex);
    });

    const cropText = this.add.text(0, -4, '', {
      fontSize: `${cropEmojiSize}px`,
      // Same emoji font fallback chain as the hand cards — keeps newer
      // glyphs (⛏️, 🌶️) rendering as colored emoji on all platforms.
      fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif',
      shadow: { offsetX: 0, offsetY: 2, color: '#000000', blur: 4, fill: true, stroke: true },
    }).setOrigin(0.5);
    container.add(cropText);

    const barWidth = this.cfg.plotSize - barInset * 2;
    const barY = this.cfg.plotSize / 2 - 10;
    const growBarBg = this.add.rectangle(0, barY, barWidth, 5, 0x000000, 0.5);
    growBarBg.setOrigin(0.5);
    growBarBg.setVisible(false);
    const growBar = this.add.rectangle(-barWidth / 2, barY, 0, 5, 0x6ab47b, 1);
    growBar.setOrigin(0, 0.5);
    growBar.setVisible(false);
    container.add(growBarBg);
    container.add(growBar);

    const zone = new Phaser.Geom.Rectangle(x, y, this.cfg.plotSize, this.cfg.plotSize);
    return { container, bg, cropText, growBar, growBarBg, zone };
  }

  private buildPiles() {
    const { width, height } = this.scale;
    if (this.cfg.isMobile) {
      // On mobile, piles tuck into the corners ABOVE the hand bar where end-round
      // sits, so they don't overlap the hand or end-round button.
      const yOffset = this.cfg.footerH + this.cfg.cardH * 0.5 + 4;
      this.deckPile = this.makePile(36, height - yOffset, 'DECK', 0x3a7d44);
      this.makePile(width - 36, height - yOffset, 'DISC', 0x6b6b6b);
    } else {
      this.deckPile = this.makePile(80, height - 96, 'DECK', 0x3a7d44);
      this.makePile(width - 80, height - 96, 'DISCARD', 0x6b6b6b);
    }
  }

  private makePile(x: number, y: number, label: string, color: number): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    for (let i = 2; i >= 0; i--) {
      const r = this.add.rectangle(i * 2, -i * 2, this.cfg.cardW * 0.6, this.cfg.cardH * 0.6, color, 1);
      r.setStrokeStyle(2, 0x000000, 0.4);
      container.add(r);
    }
    container.add(
      this.add
        .text(0, this.cfg.cardH * 0.36, label, {
          fontFamily: 'Fredoka One, cursive',
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0),
    );
    return container;
  }

  private buildEndRoundButton() {
    const { width, height } = this.scale;
    const btnW = this.cfg.isMobile ? 120 : 170;
    const btnH = this.cfg.isMobile ? 44 : 48;
    const btnFont = this.cfg.isMobile ? '13px' : '14px';
    this.endRoundBtn = this.add.container(width - btnW / 2 - 12, height - this.cfg.footerH / 2);

    // Glossy gold button to match the main-menu primary CTAs. Three stacked
    // shapes give it depth: a dark base for the bottom-edge shadow, the
    // main button face, and a top half-strip for the gloss highlight.
    const baseShadow = this.add.rectangle(0, 5, btnW, btnH, 0x000000, 0.28);
    const bg = this.add.rectangle(0, 0, btnW, btnH, 0xffd54f, 1);
    bg.setStrokeStyle(2, 0xfff5d0, 1);
    const gloss = this.add.rectangle(0, -btnH / 4, btnW - 6, btnH / 2 - 3, 0xffffff, 0.32);
    const innerRim = this.add.rectangle(0, btnH / 2 - 3, btnW - 4, 3, 0x000000, 0.18);

    const label = this.add
      .text(0, 0, this.cfg.isMobile ? '▶ End Turn' : '▶ End Turn', {
        fontFamily: 'Fredoka One, cursive',
        fontSize: btnFont,
        color: '#4a2e00',
        stroke: '#fff5d0',
        strokeThickness: 1,
      })
      .setOrigin(0.5);

    this.endRoundBtn.add([baseShadow, bg, gloss, innerRim, label]);
    this.endRoundBtn
      .setSize(btnW, btnH)
      .setInteractive({ useHandCursor: true });
    this.endRoundBtn.on('pointerdown', () => {
      // Quick "press" — drop the button down 4px so the bottom shadow
      // peeks through, mirroring the CSS `.pb-btn:active` translate.
      this.tweens.add({ targets: this.endRoundBtn, y: this.endRoundBtn.y + 4, duration: 50, yoyo: true });
      this.handleEndRound();
    });
    this.endRoundBtn.on('pointerover', () =>
      this.tweens.add({ targets: this.endRoundBtn, scale: 1.05, duration: 120 }),
    );
    this.endRoundBtn.on('pointerout', () =>
      this.tweens.add({ targets: this.endRoundBtn, scale: 1.0, duration: 140 }),
    );
  }

  // === Input handlers ===

  private handleEndRound() {
    // Gate on engine phase, NOT inputLocked. Engine phase is the source of
    // truth — if the runner says it's "play", end-round is legal regardless of
    // any animation-pacing flag we forgot to clear.
    if (this.runner.phase !== 'play') return;
    if (this.discardMode) return; // must resolve overflow before ending round
    this.inputLocked = true;
    sfx.endRound();
    const events = this.runner.apply({ kind: 'end_round' });

    // Re-read phase AFTER apply — runner state may have transitioned to draft
    // or season_end. TypeScript can't infer this so we use the runtime value.
    const phaseAfter: string = this.runner.phase;
    const seasonEnded = events.find(e => e.kind === 'season_ended');
    if (seasonEnded && seasonEnded.kind === 'season_ended') {
      this.lockInput(); // permanent — game over
      // The actual onSeasonEnd call is deferred to AFTER the harvest cascade
      // + season-complete announcement finish playing (see the async block
      // below). We don't fire it here so the player gets to watch round 12.
    } else if (phaseAfter !== 'draft') {
      // Plain round transition — unlock input now so the player can act on the
      // next round even if decorative animations are still playing.
      this.inputLocked = false;
      this.resetCardGestureState();
    }
    // For phaseAfter === 'draft': leave input locked. The modal is triggered
    // AFTER the queue finishes (see below) so the harvest/combo/round_resolved
    // animations get to play first instead of being interrupted by the modal.

    // Sync the visible state to the engine NOW so the player sees the new round
    // immediately, regardless of whether decorative animations complete. But
    // PROTECT plots about to be harvested — clearing their cropText here
    // would erase the crop image before the lift-off animation plays.
    const pendingHarvestPlots = new Set<number>();
    for (const ev of events) {
      if (ev.kind === 'crop_harvested') pendingHarvestPlots.add(ev.plotIndex);
    }
    this.syncSceneToEngine(false, pendingHarvestPlots);

    // Track whether we've surfaced the modal yet so the watchdog and the
    // queue-completion path don't both fire it.
    let modalShown = false;
    const showDraftIfNeeded = () => {
      if (modalShown) return;
      if (this.runner.phase !== 'draft') return;
      modalShown = true;
      this.onDraftRequest(this.runner.pendingDraft);
    };

    void (async () => {
      try {
        await this.playEventQueue(events);
      } catch (err) {
        console.warn('[handleEndRound] event queue failed:', err);
      }
      this.syncSceneToEngine(true);
      // Recheck overflow after sync — the safety-net add can bring in cards
      // that the queue's card_drawn events silently failed to deliver.
      this.checkHandOverflow();

      // SEASON END: harvest cascade finished. Now play the big "Season
      // Complete" banner and only THEN hand off to the results screen, so
      // the player watches round 12 actually play out instead of being
      // interrupted mid-harvest by the modal.
      if (seasonEnded && seasonEnded.kind === 'season_ended') {
        try {
          await this.animateSeasonEndAnnouncement();
        } catch (err) {
          console.warn('[handleEndRound] season banner failed:', err);
        }
        this.onSeasonEnd(seasonEnded.result);
        return;
      }

      // Harvest cascade finished — wait one beat so the final crop's price
      // text fully lands at the coin HUD before the draft modal slides in.
      // Otherwise the modal can clip the tail of the last harvest fly.
      if (phaseAfter === 'draft') {
        this.time.delayedCall(1000, showDraftIfNeeded);
      }
    })();
  }

  private lockInput() {
    this.inputLocked = true;
    this.endRoundBtn.disableInteractive();
    for (const c of this.hand) c.container.disableInteractive();
  }

  // === Hand management ===

  private addHandCard(cardId: CardId, fromX: number, fromY: number, animateArc: boolean): Promise<void> {
    const container = this.makeCardContainer(cardId, fromX, fromY);
    const visual: CardVisual = { container, cardId };
    this.hand.push(visual);
    this.makeDraggable(visual);

    const slot = this.handSlot(this.hand.length - 1);
    if (animateArc) {
      // Parabolic arc draw.
      sfx.cardDraw();
      const peakY = Math.min(fromY, slot.y) - 130;
      const progress = { t: 0 };
      // Lock hand interaction for the duration of the arc — players shouldn't
      // be able to grab/play a card that's still flying in from the deck.
      this.drawingCount += 1;
      return new Promise(resolve => {
        this.tweens.add({
          targets: progress,
          t: 1,
          duration: ANIM.drawArc,
          ease: 'Back.out',
          onUpdate: () => {
            const t = progress.t;
            const inv = 1 - t;
            container.x = inv * inv * fromX + 2 * inv * t * (fromX + (slot.x - fromX) * 0.5) + t * t * slot.x;
            container.y = inv * inv * fromY + 2 * inv * t * peakY + t * t * slot.y;
            container.rotation = Phaser.Math.Linear(0, slot.rot, t);
            container.setScale(Phaser.Math.Linear(0.5, 1.0, t));
          },
          onComplete: () => {
            this.drawingCount = Math.max(0, this.drawingCount - 1);
            this.refanHand();
            resolve();
          },
        });
      });
    } else {
      container.setPosition(slot.x, slot.y).setRotation(slot.rot).setScale(1.0);
      this.refanHand();
      return Promise.resolve();
    }
  }

  private refanHand() {
    this.hand.forEach((v, i) => {
      const slot = this.handSlot(i);
      v.container.setData('homeSlot', slot);
      this.tweens.add({
        targets: v.container,
        x: slot.x,
        y: slot.y,
        rotation: slot.rot,
        duration: ANIM.reFan,
        ease: 'Cubic.out',
        delay: i * 22,
      });
    });
  }

  private handSlot(index: number): { x: number; y: number; rot: number } {
    const { width, handY } = this.layout;
    // Reserve room for the deck/discard piles at corners + end-round button on the right.
    const reservedSides = this.cfg.isMobile ? 80 : 240;
    const count = Math.max(this.hand.length, 1);
    const spacing = Math.min(this.cfg.cardW * 0.95, (width - reservedSides) / Math.max(count, 1));
    const totalWidth = (count - 1) * spacing;
    const startX = width / 2 - totalWidth / 2;
    const x = startX + index * spacing;
    const center = (count - 1) / 2;
    const rotDeg = count <= 1 ? 0 : ((index - center) / Math.max(center, 1)) * this.cfg.handFanDeg;
    return { x, y: handY, rot: Phaser.Math.DegToRad(rotDeg) };
  }

  // === Card visual ===

  private makeCardContainer(cardId: CardId, x: number, y: number): Phaser.GameObjects.Container {
    const card = getCard(cardId);
    const container = this.add.container(x, y).setDepth(50);

    // All on-card type sizes scale with cardW so layouts work at any size.
    const W = this.cfg.cardW;
    const H = this.cfg.cardH;
    const bannerH = Math.round(H * 0.15);
    const bannerFont = `${Math.max(7, Math.round(H * 0.067))}px`;
    const emojiFont = `${Math.round(H * 0.27)}px`;
    const nameFont = `${Math.max(8, Math.round(H * 0.087))}px`;
    const statFont = `${Math.max(8, Math.round(H * 0.087))}px`;

    const bg = this.add.rectangle(0, 0, W, H, 0xffffff, 1);
    bg.setStrokeStyle(2, this.rarityColor(card.rarity));
    container.add(bg);

    const bannerColor = card.type === 'seed' ? 0x3a7d44 : 0x1e88e5;
    const banner = this.add.rectangle(0, -H / 2 + bannerH / 2, W, bannerH, bannerColor, 1);
    container.add(banner);
    container.add(
      this.add
        .text(0, -H / 2 + bannerH / 2, card.type === 'seed' ? '🌱 SEED' : '🔧 TOOL', {
          fontFamily: 'Nunito, sans-serif',
          fontSize: bannerFont,
          color: '#ffffff',
          fontStyle: 'bold',
        })
        .setOrigin(0.5),
    );

    // Force the emoji font stack: some cards use newer Unicode glyphs that
    // fall back to text-style boxes if the system sans-serif lacks them.
    // Listing the platform color-emoji fonts first guarantees the rendered
    // glyph is the colorful one across Apple / Windows / Android / Linux.
    const emojiFontFamily = '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif';
    const cardEmoji = card.emoji || (card.type === 'seed' ? '🌱' : '🔧');
    container.add(this.add.text(0, -H * 0.06, cardEmoji, { fontSize: emojiFont, fontFamily: emojiFontFamily }).setOrigin(0.5));
    container.add(
      this.add
        .text(0, H * 0.22, card.name, {
          fontFamily: 'Fredoka One, cursive',
          fontSize: nameFont,
          color: '#5d4037',
          align: 'center',
          wordWrap: { width: W - 6 },
        })
        .setOrigin(0.5),
    );

    if (card.type === 'seed') {
      container.add(
        this.add
          .text(-W / 2 + 8, H / 2 - 10, `⏱${card.growRounds}`, {
            fontFamily: 'Nunito, sans-serif',
            fontSize: statFont,
            color: '#e65100',
            fontStyle: 'bold',
          })
          .setOrigin(0, 0.5),
      );
      container.add(
        this.add
          .text(W / 2 - 8, H / 2 - 10, `🌾${card.sellPrice}`, {
            fontFamily: 'Nunito, sans-serif',
            fontSize: statFont,
            color: '#2e7d32',
            fontStyle: 'bold',
          })
          .setOrigin(1, 0.5),
      );
    } else {
      container.add(
        this.add
          .text(0, H / 2 - 10, card.persistent ? '🔁 lasting' : '⚡ instant', {
            fontFamily: 'Nunito, sans-serif',
            fontSize: statFont,
            color: '#1e88e5',
            fontStyle: 'bold',
          })
          .setOrigin(0.5),
      );
    }

    container.setSize(W, H);
    return container;
  }

  // === Card inspector (hover tooltip with full details) ===

  private showInspector(visual: CardVisual): void {
    const anchor = { x: visual.container.x, y: visual.container.y, w: this.cfg.cardW, h: this.cfg.cardH };
    this.showInspectorFor(visual.cardId, anchor);
  }

  // Renders the same tooltip for a planted crop in a plot, with optional extra footer
  // (e.g. growth status, "click to undo" hint).
  private showPlotInspector(plotIndex: number): void {
    const plotState = this.runner.state.plots[plotIndex];
    if (plotState.kind === 'empty') return;
    const cardId = plotState.crop.cardId;
    const plot = this.plots[plotIndex];
    const anchor = { x: plot.container.x, y: plot.container.y, w: this.cfg.plotSize, h: this.cfg.plotSize };

    const seed = getCard(cardId);
    const isReady = plotState.kind === 'ready';
    const undoable = this.runner.state.plantedThisRound.includes(plotIndex);

    const footer: { text: string; color: string }[] = [];
    if (seed.type === 'seed') {
      if (isReady) {
        footer.push({ text: '✨ Ready to harvest at end of round', color: '#ffd54f' });
      } else {
        footer.push({
          text: `🌱 ${plotState.crop.growRoundsRemaining} round${plotState.crop.growRoundsRemaining === 1 ? '' : 's'} until ready`,
          color: '#a5d6a7',
        });
      }
    }
    if (undoable) {
      footer.push({ text: '↩ Click plot to return seed to hand', color: '#fff176' });
    }

    this.showInspectorFor(cardId, anchor, footer);
  }

  private showInspectorFor(
    cardId: CardId,
    anchor: { x: number; y: number; w: number; h: number },
    extraLines: { text: string; color: string }[] = [],
  ): void {
    this.hideInspector();
    const card = getCard(cardId);
    const { width, height } = this.scale;

    const PANEL_W = 280;
    const PADDING = 14;
    const lines: { text: string; size: number; color: string; weight?: string; gap?: number }[] = [];

    const typeLabel = card.type === 'seed' ? '🌱  SEED' : '🔧  TOOL';
    lines.push({ text: typeLabel, size: 11, color: '#a0a0a0', weight: 'bold', gap: 2 });
    lines.push({ text: card.name, size: 18, color: '#ffffff', weight: 'bold', gap: 8 });

    if (card.type === 'seed') {
      lines.push({ text: `⏱  Grows in ${card.growRounds} round${card.growRounds === 1 ? '' : 's'}`, size: 13, color: '#ffcc80' });
      lines.push({ text: `🌾  Sells for ${card.sellPrice} coins`, size: 13, color: '#a5d6a7', gap: 6 });
      if (card.effect) lines.push({ text: card.effect, size: 12, color: '#e0e0e0' });
      lines.push({ text: `Crop type: ${card.crop}`, size: 11, color: '#888', gap: 4 });
    } else {
      lines.push({ text: card.persistent ? '🔁  Persistent effect' : '⚡  Instant effect', size: 12, color: '#90caf9', gap: 6 });
      lines.push({ text: card.effect, size: 13, color: '#e0e0e0' });
    }

    const rarityColor: Record<string, string> = {
      common: '#a5d6a7', uncommon: '#90caf9', rare: '#ce93d8',
      epic: '#ffab76', legendary: '#ffd54f', mythic: '#ff8a65',
    };
    lines.push({ text: card.rarity.toUpperCase(), size: 10, color: rarityColor[card.rarity] ?? '#fff', weight: 'bold', gap: 6 });

    for (const extra of extraLines) {
      lines.push({ text: extra.text, size: 12, color: extra.color, gap: 4 });
    }

    const container = this.add.container(0, 0).setDepth(900);
    let y = PADDING;
    let totalH = PADDING;
    const texts: Phaser.GameObjects.Text[] = [];
    for (const line of lines) {
      const t = this.add.text(PADDING, y, line.text, {
        fontFamily: line.weight === 'bold' ? 'Fredoka One, cursive' : 'Nunito, sans-serif',
        fontSize: `${line.size}px`,
        color: line.color,
        wordWrap: { width: PANEL_W - PADDING * 2 },
      });
      texts.push(t);
      const lineH = t.height + (line.gap ?? 4);
      y += lineH;
      totalH += lineH;
    }
    totalH += PADDING - 4;

    const bg = this.add.rectangle(0, 0, PANEL_W, totalH, 0x111111, 0.96).setOrigin(0, 0);
    bg.setStrokeStyle(2, 0xffffff, 0.18);
    container.add(bg);
    for (const t of texts) container.add(t);

    const wantRight = anchor.x + anchor.w / 2 + 16 + PANEL_W < width;
    const px = wantRight ? anchor.x + anchor.w / 2 + 16 : anchor.x - anchor.w / 2 - 16 - PANEL_W;
    const py = Math.max(8, Math.min(height - totalH - 8, anchor.y - totalH / 2));
    container.setPosition(px, py).setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 120, ease: 'Cubic.out' });
    this.inspector = container;
  }

  private hideInspector(): void {
    if (!this.inspector) return;
    const c = this.inspector;
    this.inspector = null;
    this.tweens.add({
      targets: c,
      alpha: 0,
      duration: 100,
      onComplete: () => c.destroy(),
    });
  }

  // === Drag & drop ===

  private makeDraggable(visual: CardVisual) {
    const { container } = visual;
    container.setInteractive({ useHandCursor: true, draggable: true });

    // Distinguish a tap (no drag motion) from a real drag, so a click can auto-play.
    // Stored on the container's data so we can force-reset it externally — the
    // React draft modal can occlude the canvas and Phaser can miss the pointer
    // sequence that would normally clear this flag.
    container.setData('didDrag', false);

    container.on('pointerover', () => {
      if (this.drawingCount > 0) return;
      if (this.discardMode) return;
      if (this.inputLocked) return;
      this.tweens.add({
        targets: container,
        y: (container.getData('homeSlot')?.y ?? container.y) - 12,
        scale: 1.06,
        rotation: 0,
        duration: 140,
        ease: 'Cubic.out',
      });
      container.setDepth(120);
      this.showInspector(visual);
    });
    container.on('pointerout', () => {
      if (this.drawingCount > 0) return;
      if (this.discardMode) return;
      if (this.inputLocked) return;
      const slot = container.getData('homeSlot');
      this.hideInspector();
      if (!slot) return;
      this.tweens.add({
        targets: container,
        x: slot.x,
        y: slot.y,
        rotation: slot.rot,
        scale: 1.0,
        duration: 160,
        ease: 'Cubic.out',
      });
      container.setDepth(50);
    });

    container.on('pointerdown', () => {
      // Start of a new gesture — assume click until a drag fires.
      container.setData('didDrag', false);
    });
    container.on('pointerup', () => {
      if (this.drawingCount > 0) return;
      if (this.discardMode) {
        if (container.getData('didDrag')) return;
        this.toggleDiscardSelection(visual);
        return;
      }
      if (this.inputLocked) return;
      if (container.getData('didDrag')) return; // dragend already handled this gesture
      this.handleClickPlay(visual);
    });

    container.on('dragstart', () => {
      if (this.drawingCount > 0) return;
      if (this.discardMode) return; // no dragging while choosing discards
      if (this.inputLocked) return;
      container.setData('didDrag', true);
      container.setDepth(200);
      this.hideInspector();
      sfx.cardLift();
      this.tweens.add({ targets: container, scale: 1.08, rotation: 0, duration: 100 });
    });
    container.on('drag', (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      if (this.drawingCount > 0) return;
      if (this.inputLocked) return;
      container.x = dragX;
      container.y = dragY;
      this.updatePlotHoverHighlight(visual, dragX, dragY);
    });
    container.on('dragend', (pointer: Phaser.Input.Pointer) => {
      if (this.inputLocked) return;
      this.clearPlotHoverHighlight();
      this.handleDrop(visual, pointer.x, pointer.y);
    });
  }

  private handleDrop(visual: CardVisual, x: number, y: number) {
    if (this.runner.phase !== 'play') { this.snapBackToHand(visual); return; }
    const handIndex = this.hand.indexOf(visual);
    if (handIndex < 0) return;

    // Find which plot (if any) the pointer is over.
    const plotIndex = this.plots.findIndex(p => p.zone.contains(x, y));
    const card = getCard(visual.cardId);

    if (plotIndex >= 0) {
      const action: import('@engine/index').RunAction =
        card.type === 'seed'
          ? { kind: 'play_seed', handIndex, plotIndex }
          : { kind: 'play_tool', handIndex, targetPlotIndex: plotIndex };
      const events = this.runner.apply(action);
      if (events.length > 0) {
        this.hideInspector();
        // Tools always play the dramatic centre→plot sequence so the player sees
        // the tool's signature VFX. Seeds settle in place and trigger dirt VFX
        // via the seed_planted event.
        if (card.type === 'tool') {
          void this.playToolFlow(visual, card.id, plotIndex, events);
        } else {
          this.consumeHandCard(visual);
          void this.playEventQueue(events);
        }
        return;
      }
    } else if (card.type === 'tool') {
      // Tool dragged off-plot → played untargeted.
      const events = this.runner.apply({ kind: 'play_tool', handIndex });
      if (events.length > 0) {
        this.hideInspector();
        void this.playToolFlow(visual, card.id, undefined, events);
        return;
      }
    }

    // Invalid drop → snap back.
    this.snapBackToHand(visual);
  }

  // While the player drags a card, highlight whichever plot the pointer is
  // currently over. Color signals validity so they can decide before letting
  // go: green = will play here, red = invalid for this card.
  private updatePlotHoverHighlight(visual: CardVisual, x: number, y: number) {
    const plotIndex = this.plots.findIndex(p => p.zone.contains(x, y));
    if (plotIndex === this.hoveredDropPlotIndex) return;
    // Pointer moved off the previous highlighted plot — clear it first.
    this.clearPlotHoverHighlight();
    if (plotIndex < 0) return;

    const card = getCard(visual.cardId);
    const plotState = this.runner.state.plots[plotIndex];
    const valid = this.isValidDropTarget(card, plotState);
    const stroke = valid ? 0xa5d6a7 : 0xef9a9a;
    this.plots[plotIndex].bg.setStrokeStyle(5, stroke, 1);
    this.hoveredDropPlotIndex = plotIndex;
  }

  // Drop the highlight when drag ends or the pointer leaves the last plot.
  // Restores the stroke based on the plot's current state (gold-if-ready,
  // green otherwise) so the visual returns to its resting look.
  private clearPlotHoverHighlight() {
    if (this.hoveredDropPlotIndex < 0) return;
    const idx = this.hoveredDropPlotIndex;
    const visual = this.plots[idx];
    const state = this.runner.state.plots[idx];
    if (state?.kind === 'ready') {
      visual.bg.setStrokeStyle(4, 0xffd54f, 1);
    } else {
      visual.bg.setStrokeStyle(2, 0x6ab47b, 0.55);
    }
    this.hoveredDropPlotIndex = -1;
  }

  // Mirrors the engine's per-tool target rules so the drag-time highlight
  // matches what handleDrop will accept. Conservative — when in doubt, true.
  private isValidDropTarget(card: SeedCard | ToolCard, plotState: import('@engine/index').PlotState | undefined): boolean {
    if (!plotState) return false;
    if (card.type === 'seed') return plotState.kind === 'empty';
    // Tool: only a few have hard target requirements; the rest accept any
    // plot (or ignore the target entirely).
    switch (card.id) {
      case 'tool.watering_can':
      case 'tool.growth_potion':
        return plotState.kind === 'growing';
      case 'tool.wheelbarrow':
        return plotState.kind !== 'empty';
      default:
        return true;
    }
  }

  private snapBackToHand(visual: CardVisual) {
    const i = this.hand.indexOf(visual);
    if (i < 0) return;
    sfx.cardSnapBack();
    const slot = this.handSlot(i);
    visual.container.setData('homeSlot', slot);
    this.tweens.add({
      targets: visual.container,
      x: slot.x,
      y: slot.y,
      rotation: slot.rot,
      scale: 1.0,
      duration: ANIM.invalidSnap,
      ease: 'Back.out',
      onComplete: () => visual.container.setDepth(50),
    });
  }

  private consumeHandCard(visual: CardVisual) {
    const i = this.hand.indexOf(visual);
    if (i >= 0) this.hand.splice(i, 1);
    sfx.cardDiscard();
    // Settle: brief shrink + fade so the card "lands" instead of vanishing.
    this.tweens.add({
      targets: visual.container,
      scale: 0.4,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.in',
      onComplete: () => visual.container.destroy(),
    });
    this.refanHand();
    this.refreshHud();
  }

  // === Discard mode (hand overflow) ===

  // Hand cap = the run's `startingHandSize`. Anything above this is overflow.
  private get handCap(): number {
    return this.runner?.config.startingHandSize ?? 0;
  }

  // Returns the count of cards over the cap. 0 means no overflow.
  private overflowCount(): number {
    return Math.max(0, this.runner.state.hand.length - this.handCap);
  }

  // Enter discard mode: lock normal input, shake every hand card, show counter
  // + greyed discard button. `onDone` runs after the player commits a discard
  // and the engine action resolves.
  private enterDiscardMode(required: number, onDone: () => void) {
    if (this.discardMode) return;
    this.discardMode = true;
    this.discardRequired = required;
    this.discardSelected.clear();
    this.deferredAfterDiscard = onDone;
    this.inputLocked = true;          // suppress normal hover/play handlers
    this.hideInspector();

    // Slightly lift every card and start a constant shake. Cards are otherwise
    // returned to their hand slot — selection lifts them higher (see toggle).
    for (let i = 0; i < this.hand.length; i++) {
      const visual = this.hand[i];
      const slot = this.handSlot(i);
      visual.container.setData('homeSlot', slot);
      visual.container.setData('discardSelected', false);
      // Snap to slightly above slot so the shake reads as "alert".
      this.tweens.killTweensOf(visual.container);
      this.tweens.add({
        targets: visual.container,
        x: slot.x,
        y: slot.y - 14,
        rotation: 0,
        scale: 1.0,
        duration: 200,
        ease: 'Cubic.out',
      });
      this.startCardShake(visual, slot);
      // Wire the discard tap handler. We don't replace the existing pointerup —
      // instead handleClickPlay short-circuits when discardMode is true.
    }

    this.buildDiscardOverlay();
    this.refreshDiscardButton();
  }

  private startCardShake(visual: CardVisual, _slot: { x: number; y: number; rot: number }) {
    // Tiny rotational jitter that loops forever until cleared. Position is held
    // relative to the slot; selection-lift adjusts y separately so the shake
    // composes correctly.
    const tween = this.tweens.add({
      targets: visual.container,
      angle: { from: -3, to: 3 },
      duration: 90,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    visual.container.setData('shakeTween', tween);
    this.discardShakeTweens.push(tween);
  }

  private stopAllCardShakes() {
    for (const t of this.discardShakeTweens) {
      try { t.stop(); } catch { /* tween may already be killed */ }
    }
    this.discardShakeTweens = [];
    for (const v of this.hand) {
      v.container.setData('shakeTween', null);
      v.container.setAngle(0);
    }
  }

  // Toggle a card's selection state. Selected cards lift higher and get a
  // golden highlight; tapping again unselects and returns to the shaking row.
  private toggleDiscardSelection(visual: CardVisual) {
    if (!this.discardMode) return;
    const i = this.hand.indexOf(visual);
    if (i < 0) return;
    const slot = this.handSlot(i);

    if (this.discardSelected.has(i)) {
      this.discardSelected.delete(i);
      visual.container.setData('discardSelected', false);
      sfx.cardSnapBack();
      this.tweens.add({
        targets: visual.container,
        y: slot.y - 14,
        scale: 1.0,
        duration: 180,
        ease: 'Cubic.out',
      });
      this.applyDiscardHighlight(visual, false);
    } else {
      // Cap selections at the required count — one over is fine, but block
      // wild over-selection so the counter stays meaningful.
      if (this.discardSelected.size >= this.discardRequired) return;
      this.discardSelected.add(i);
      visual.container.setData('discardSelected', true);
      sfx.cardLift();
      this.tweens.add({
        targets: visual.container,
        y: slot.y - 48,
        scale: 1.08,
        duration: 180,
        ease: 'Back.out',
      });
      this.applyDiscardHighlight(visual, true);
    }
    this.refreshDiscardButton();
  }

  // Toggle a golden glow rectangle behind the card to mark it as selected.
  private applyDiscardHighlight(visual: CardVisual, on: boolean) {
    const existing = visual.container.getData('discardHighlight') as Phaser.GameObjects.Rectangle | null;
    if (on) {
      if (existing) return;
      const W = this.cfg.cardW + 14;
      const H = this.cfg.cardH + 14;
      const glow = this.add.rectangle(0, 0, W, H, 0xffd54f, 0.35);
      glow.setStrokeStyle(3, 0xffc107, 0.95);
      visual.container.addAt(glow, 0);
      visual.container.setData('discardHighlight', glow);
    } else {
      if (!existing) return;
      existing.destroy();
      visual.container.setData('discardHighlight', null);
    }
  }

  private buildDiscardOverlay() {
    if (this.discardOverlay) return;
    const { width, height } = this.scale;

    const container = this.add.container(0, 0).setDepth(900);
    container.setScrollFactor(0);

    // Banner across the top of the hand area: counter + instructions.
    const bannerY = height - this.cfg.footerH - this.cfg.cardH - 70;
    const bannerW = Math.min(width - 20, 460);
    const bannerH = 56;
    const bannerBg = this.add.rectangle(width / 2, bannerY, bannerW, bannerH, 0x000000, 0.78);
    bannerBg.setStrokeStyle(2, 0xffc107, 0.9);
    container.add(bannerBg);

    const title = this.add.text(width / 2, bannerY - 10, 'HAND OVERFLOW', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '14px',
      color: '#ffc107',
    }).setOrigin(0.5);
    container.add(title);

    const counter = this.add.text(width / 2, bannerY + 12,
      `Choose ${this.discardRequired} card${this.discardRequired > 1 ? 's' : ''} to discard  (0 / ${this.discardRequired})`, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(counter);
    this.discardCounterText = counter;

    // Discard button below the banner. Greyed out until selection count == required.
    const btnY = bannerY + bannerH / 2 + 32;
    const btnW = 160;
    const btnH = 44;
    const btn = this.add.container(width / 2, btnY);
    const bg = this.add.rectangle(0, 0, btnW, btnH, 0x424242, 0.95);
    bg.setStrokeStyle(2, 0x616161, 1);
    btn.add(bg);
    const label = this.add.text(0, 0, 'DISCARD', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '15px',
      color: '#9e9e9e',
    }).setOrigin(0.5);
    btn.add(label);
    btn.setSize(btnW, btnH);
    btn.setInteractive({ useHandCursor: true });
    btn.on('pointerup', () => this.tryCommitDiscard());
    container.add(btn);

    this.discardButtonBg = bg;
    this.discardButtonLabel = label;
    this.discardOverlay = container;
  }

  private refreshDiscardButton() {
    if (!this.discardButtonBg || !this.discardButtonLabel || !this.discardCounterText) return;
    const ready = this.discardSelected.size === this.discardRequired;
    this.discardCounterText.setText(
      `Choose ${this.discardRequired} card${this.discardRequired > 1 ? 's' : ''} to discard  ` +
      `(${this.discardSelected.size} / ${this.discardRequired})`,
    );
    if (ready) {
      this.discardButtonBg.setFillStyle(0xc62828, 0.98);
      this.discardButtonBg.setStrokeStyle(2, 0xff8a80, 1);
      this.discardButtonLabel.setColor('#ffffff');
    } else {
      this.discardButtonBg.setFillStyle(0x424242, 0.95);
      this.discardButtonBg.setStrokeStyle(2, 0x616161, 1);
      this.discardButtonLabel.setColor('#9e9e9e');
    }
  }

  private tryCommitDiscard() {
    if (!this.discardMode) return;
    if (this.discardSelected.size !== this.discardRequired) return;

    const indices = Array.from(this.discardSelected).sort((a, b) => a - b);

    // Map indices → visuals BEFORE the engine splices, so we can animate the
    // chosen cards out and let syncHandToEngine clean up any drift.
    const chosen: CardVisual[] = indices.map(i => this.hand[i]).filter(Boolean) as CardVisual[];

    // Apply engine action.
    const events = this.runner.apply({ kind: 'discard_cards', handIndices: indices });

    // Clear discard-mode visuals before sync.
    this.exitDiscardMode();

    // Animate the selected cards fading out toward the discard pile.
    for (const v of chosen) {
      // Remove from hand array immediately so refanHand reflows the rest.
      const idx = this.hand.indexOf(v);
      if (idx >= 0) this.hand.splice(idx, 1);
      this.applyDiscardHighlight(v, false);
      sfx.cardDiscard();
      this.tweens.add({
        targets: v.container,
        scale: 0.4,
        alpha: 0,
        duration: 220,
        ease: 'Cubic.in',
        onComplete: () => v.container.destroy(),
      });
    }
    this.refanHand();

    // Replay the cards_discarded event for any future hooks (none right now);
    // syncSceneToEngine will reconcile any leftover drift.
    void this.playEventQueue(events).then(() => {
      this.syncSceneToEngine(true);
      this.refreshHud();
      const cb = this.deferredAfterDiscard;
      this.deferredAfterDiscard = null;
      if (cb) cb();
    });
  }

  private exitDiscardMode() {
    this.discardMode = false;
    this.discardRequired = 0;
    this.discardSelected.clear();
    this.stopAllCardShakes();
    if (this.discardOverlay) {
      this.discardOverlay.destroy();
      this.discardOverlay = null;
    }
    this.discardCounterText = null;
    this.discardButtonBg = null;
    this.discardButtonLabel = null;
    // Return remaining hand cards to their normal slots and clear highlights.
    for (let i = 0; i < this.hand.length; i++) {
      const v = this.hand[i];
      this.applyDiscardHighlight(v, false);
      const slot = this.handSlot(i);
      v.container.setData('homeSlot', slot);
      this.tweens.add({
        targets: v.container,
        x: slot.x,
        y: slot.y,
        rotation: slot.rot,
        scale: 1.0,
        duration: 220,
        ease: 'Cubic.out',
      });
    }
    // Re-enable normal play input ONLY if no other system is holding the lock.
    // We assume the discard interrupt was the only reason input was locked.
    this.inputLocked = false;
  }

  // === Event playback ===

  private async playEventQueue(events: RunEvent[]): Promise<void> {
    // Pre-scan for a harvest cascade and announce it ONCE before the first
    // crop_harvested fires, so the player knows what's about to happen and
    // doesn't miss the opening of the sequence.
    const harvestCount = events.reduce((n, e) => e.kind === 'crop_harvested' ? n + 1 : n, 0);
    let announced = false;
    const maybeAnnounceHarvest = async (ev: RunEvent) => {
      if (announced) return;
      if (ev.kind !== 'crop_harvested') return;
      announced = true;
      try { await this.animateHarvestAnnouncement(harvestCount); } catch { /* swallow */ }
    };

    for (const ev of events) {
      // Don't let one bad event poison the rest of the queue. Each event runs
      // in its own try-block; if it errors we log and continue, ensuring
      // round_started/card_drawn etc. still play and the game state stays
      // visually consistent with the engine.
      try {
        await maybeAnnounceHarvest(ev);
        await this.playEvent(ev);
      } catch (err) {
        console.warn('[playEventQueue] event failed:', ev.kind, err);
      }
      try {
        this.modifiersPanel.refresh(computeActiveModifiers(this.runner.state));
      } catch (err) {
        console.warn('[playEventQueue] modifiers refresh failed:', err);
      }
    }
    this.refreshHud();
    this.checkHandOverflow();
  }

  // Big centered banner that announces the harvest cascade. Plays once per
  // queue, before the first crop_harvested fires. Resolves when the banner
  // has faded out so the harvest sequence picks up cleanly.
  private animateHarvestAnnouncement(count: number): Promise<void> {
    const { width, height } = this.scale;
    const text = count === 1 ? '🌾 Harvesting!' : `🌾 Harvesting ${count} crops!`;

    const label = this.add
      .text(width / 2, height / 2 - 60, text, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: '34px',
        color: '#ffe082',
        stroke: '#3e2723',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setAlpha(0)
      .setScale(0.7);

    sfx.combo();

    return new Promise(resolve => {
      this.tweens.add({
        targets: label,
        alpha: 1,
        scale: 1.0,
        duration: 220,
        ease: 'Back.out',
      });
      this.tweens.add({
        targets: label,
        alpha: 0,
        scale: 1.12,
        delay: 700,
        duration: 240,
        onComplete: () => {
          label.destroy();
          resolve();
        },
      });
    });
  }

  // Called after every event-queue completion. If the engine hand exceeds the
  // run's hand cap, enter discard mode so the player has to choose which cards
  // to keep before the game can continue.
  private checkHandOverflow() {
    if (this.discardMode) return;
    if (!this.runner) return;
    if (this.runner.phase !== 'play') return;
    const need = this.overflowCount();
    if (need <= 0) return;
    this.enterDiscardMode(need, () => { /* no follow-up needed: engine state already in sync */ });
  }

  private playEvent(ev: RunEvent): Promise<void> {
    switch (ev.kind) {
      case 'card_drawn':
        return this.addHandCard(ev.cardId, this.deckPile.x, this.deckPile.y, true);
      case 'seed_planted':
        return this.animatePlant(ev.plotIndex, getCard(ev.cardId) as SeedCard);
      case 'plant_undone':
        return this.animatePlantUndone(ev.plotIndex, ev.cardId);
      case 'tool_used':
        return this.animateToolUsed(ev.targetPlotIndex);
      case 'crop_grew':
        return this.animateGrowTick(ev.plotIndex);
      case 'crop_ready':
        return this.animateReady(ev.plotIndex);
      case 'crop_harvested':
        sfx.harvest();
        return this.animateHarvest(ev.plotIndex, ev.finalPrice);
      case 'combo_triggered':
        sfx.combo();
        return this.animateCombo(ev.combo);
      case 'round_started':
        return this.animateRoundLabel(ev.round);
      case 'event_triggered':
        if (ev.event.kind === 'boon') sfx.activate();
        else sfx.cancel();
        this.eventHistory.set(ev.round, ev.event);
        this.refreshTimeline();
        return this.animateEventToast(ev.event);
      case 'draft_offered':
        // Modal is now triggered SYNCHRONOUSLY in handleEndRound the moment the
        // engine enters draft phase — see that code path. Treating this event
        // as a no-op here avoids a redundant React state update if the queue
        // eventually replays it.
        return Promise.resolve();
      case 'event_resolved':
      case 'draft_resolved':
      case 'round_resolved':
      case 'season_ended':
      case 'deck_reshuffled':
      case 'cards_discarded':
        // The discard animation is owned by tryCommitDiscard so the visuals
        // can fly out before the engine event replays. Nothing to do here.
        return Promise.resolve();
      case 'order_progress':
        return this.animateOrderProgress(ev.orderId, ev.progress, ev.goal, ev.fulfilledNow);
      case 'order_fulfilled':
        return this.animateOrderFulfilled(ev.orderId, ev.reward);
    }
  }

  // Event modal: pauses the queue until the player confirms (solo) or the
  // 5-second timer auto-confirms (PvP). The promise resolves only after the
  // overlay closes, so the rest of the round's events wait for input.
  private animateEventToast(event: import('@engine/index').EventCard): Promise<void> {
    const { width, height } = this.scale;
    const accent = event.kind === 'boon' ? '#a5d6a7' : event.kind === 'hazard' ? '#ef9a9a' : '#ce93d8';
    const bgColor = event.kind === 'boon' ? 0x2e7d32 : event.kind === 'hazard' ? 0xc62828 : 0x6a1b9a;
    const ringColor = event.kind === 'boon' ? 0xa5d6a7 : event.kind === 'hazard' ? 0xef9a9a : 0xce93d8;
    const kindLabel = event.kind.toUpperCase();

    const PANEL_W = Math.min(width - 32, 420);
    const PANEL_H = 260;

    const overlay = this.add.container(0, 0).setDepth(950);

    // Dim backdrop. Eats clicks so the player can't accidentally play through
    // the modal — this is a true gameplay pause.
    const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.55)
      .setOrigin(0, 0).setInteractive();
    overlay.add(backdrop);

    // Panel container, centered.
    const panel = this.add.container(width / 2, height / 2);
    overlay.add(panel);

    const panelBg = this.add.rectangle(0, 0, PANEL_W, PANEL_H, bgColor, 0.97);
    panelBg.setStrokeStyle(3, ringColor, 1);
    panel.add(panelBg);

    // Kind banner across the top of the panel.
    const banner = this.add.rectangle(0, -PANEL_H / 2 + 18, PANEL_W, 36, 0x000000, 0.35);
    panel.add(banner);
    panel.add(
      this.add.text(0, -PANEL_H / 2 + 18, kindLabel, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: '14px',
        color: accent,
        fontStyle: 'bold',
      }).setOrigin(0.5),
    );

    // Big icon.
    panel.add(
      this.add.text(0, -PANEL_H / 2 + 76, event.icon, { fontSize: '48px' }).setOrigin(0.5),
    );

    // Event name.
    panel.add(
      this.add.text(0, -PANEL_H / 2 + 124, event.name, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: '20px',
        color: '#ffffff',
      }).setOrigin(0.5),
    );

    // Description, wrapped.
    panel.add(
      this.add.text(0, -PANEL_H / 2 + 158, event.description, {
        fontFamily: 'Nunito, sans-serif',
        fontSize: '13px',
        color: '#ffffff',
        wordWrap: { width: PANEL_W - 32 },
        align: 'center',
      }).setOrigin(0.5, 0),
    );

    // Confirm button at the bottom of the panel. In PvP it shows a live
    // countdown; in solo there's no timer — the player decides when to advance.
    const btnY = PANEL_H / 2 - 30;
    const btnW = 180;
    const btnH = 44;
    const btn = this.add.container(0, btnY);
    const btnBg = this.add.rectangle(0, 0, btnW, btnH, 0xffffff, 0.95);
    btnBg.setStrokeStyle(2, ringColor, 1);
    btn.add(btnBg);
    const btnLabel = this.add.text(0, 0, 'CONTINUE', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '15px',
      color: '#1b3a1f',
    }).setOrigin(0.5);
    btn.add(btnLabel);
    btn.setSize(btnW, btnH);
    btn.setInteractive({ useHandCursor: true });
    panel.add(btn);

    // Pop in.
    overlay.setAlpha(0);
    panel.setScale(0.85);
    this.tweens.add({ targets: overlay, alpha: 1, duration: 180 });
    this.tweens.add({ targets: panel, scale: 1, duration: 240, ease: 'Back.out' });

    return new Promise(resolve => {
      let resolved = false;
      let countdownEvent: Phaser.Time.TimerEvent | null = null;

      const close = () => {
        if (resolved) return;
        resolved = true;
        if (countdownEvent) countdownEvent.remove(false);
        backdrop.disableInteractive();
        btn.disableInteractive();
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          scale: 0.92,
          duration: 180,
          onComplete: () => {
            overlay.destroy();
            resolve();
          },
        });
      };

      btn.on('pointerup', close);
      // Backdrop is intentionally NOT a dismiss target — keeps the player from
      // accidentally tapping past the modal without reading it.

      if (this.isPvp) {
        // 5-second auto-close in PvP. Show a live countdown in the button.
        let secondsLeft = 5;
        btnLabel.setText(`CONTINUE (${secondsLeft})`);
        countdownEvent = this.time.addEvent({
          delay: 1000,
          repeat: 4,
          callback: () => {
            secondsLeft -= 1;
            if (secondsLeft <= 0) {
              close();
            } else {
              btnLabel.setText(`CONTINUE (${secondsLeft})`);
            }
          },
        });
      }
    });
  }

  // Click-to-play: fire the most-natural action for the card type.
  // Seeds → first empty plot. Targeted tools → first valid plot. Untargeted tools → just play.
  private handleClickPlay(visual: CardVisual) {
    if (this.runner.phase !== 'play') return;
    const handIndex = this.hand.indexOf(visual);
    if (handIndex < 0) return;
    const card = getCard(visual.cardId);

    let action: import('@engine/index').RunAction | null = null;
    if (card.type === 'seed') {
      const plotIndex = this.runner.state.plots.findIndex(p => p.kind === 'empty');
      if (plotIndex < 0) {
        this.shakeCard(visual, 'No empty plot');
        return;
      }
      action = { kind: 'play_seed', handIndex, plotIndex };
    } else {
      // Watering Can / Growth Potion need a growing plot. Wheelbarrow needs ANY non-empty plot.
      // Other tools (Fertilizer Bag, Garden Fork, Scarecrow, Compost Heap, Drip Line, Rainbow
      // Sprinkler, Golden Trowel, Silver Hoe, Seed Vault) play untargeted.
      const needsGrowing = card.id === 'tool.watering_can' || card.id === 'tool.growth_potion';
      const needsAnyCrop = card.id === 'tool.wheelbarrow';
      let targetPlotIndex: number | undefined;
      if (needsGrowing) {
        targetPlotIndex = this.runner.state.plots.findIndex(p => p.kind === 'growing');
        if (targetPlotIndex < 0) {
          this.shakeCard(visual, 'No growing plot');
          return;
        }
      } else if (needsAnyCrop) {
        targetPlotIndex = this.runner.state.plots.findIndex(p => p.kind !== 'empty');
        if (targetPlotIndex < 0) {
          this.shakeCard(visual, 'No crop in plot');
          return;
        }
      }
      action = { kind: 'play_tool', handIndex, targetPlotIndex };
    }

    const events = this.runner.apply(action);
    if (events.length === 0) {
      this.shakeCard(visual, 'Cannot play');
      return;
    }
    this.hideInspector();

    // Tools always go through the dramatic playToolFlow (fly to centre, tool
    // VFX, plot follow-up if applicable). Seeds keep the existing fly-to-plot
    // → dirt VFX flow.
    if (card.type === 'tool') {
      void this.playToolFlow(visual, card.id, action.kind === 'play_tool' ? action.targetPlotIndex : undefined, events);
      return;
    }

    // Seed path: animate the card flying from the hand to its target plot,
    // THEN destroy + run the seed_planted event (dirt VFX + crop reveal).
    const seedPlotIndex = (action as { kind: 'play_seed'; plotIndex: number }).plotIndex;
    const idx = this.hand.indexOf(visual);
    if (idx >= 0) this.hand.splice(idx, 1);
    this.refanHand();
    void this.animateCardToPlot(visual, seedPlotIndex).then(() => {
      visual.container.destroy();
      void this.playEventQueue(events);
    });
    this.refreshHud();
  }

  private shakeCard(visual: CardVisual, hint?: string) {
    const slot = visual.container.getData('homeSlot');
    if (!slot) return;
    this.tweens.add({
      targets: visual.container,
      x: { from: slot.x - 8, to: slot.x + 8 },
      duration: 60,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.inOut',
      onComplete: () => visual.container.setX(slot.x),
    });
    if (hint) this.flashHint(hint);
  }

  private flashHint(text: string) {
    const { width } = this.scale;
    const { plotsY } = this.layout;
    const label = this.add
      .text(width / 2, plotsY + this.cfg.plotSize + 30, text, {
        fontFamily: 'Nunito, sans-serif',
        fontSize: '12px',
        color: '#ef9a9a',
        backgroundColor: '#000000aa',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(800)
      .setAlpha(0);
    this.tweens.add({ targets: label, alpha: 1, duration: 100 });
    this.tweens.add({
      targets: label,
      alpha: 0,
      delay: 900,
      duration: 200,
      onComplete: () => label.destroy(),
    });
  }

  private handleUndoPlant(plotIndex: number) {
    if (this.runner.phase !== 'play') return;
    this.hideInspector();
    const events = this.runner.apply({ kind: 'undo_plant', plotIndex });
    if (events.length === 0) return;
    void this.playEventQueue(events);
  }

  private animatePlantUndone(plotIndex: number, cardId: CardId): Promise<void> {
    const plot = this.plots[plotIndex];
    // Clear the plot visual immediately.
    plot.cropText.setText('');
    plot.bg.setFillStyle(0x5a3a20, 0.7);
    plot.growBar.setVisible(false);
    plot.growBarBg.setVisible(false);

    // The engine has already pushed the cardId back to hand at the END of state.hand.
    // Animate a card visual flying from the plot back to its hand slot.
    const handIndex = this.runner.state.hand.length - 1;
    return this.addHandCard(cardId, plot.container.x, plot.container.y, true).then(() => {
      void handIndex; // hand reflows automatically via refanHand()
    });
  }

  private animatePlant(plotIndex: number, card: SeedCard): Promise<void> {
    const plot = this.plots[plotIndex];
    plot.cropText.setText(card.emoji).setAlpha(0).setScale(0.3);
    plot.growBar.setVisible(true);
    plot.growBarBg.setVisible(true);
    this.refreshGrowBar(plotIndex);
    this.spawnDirtVfx(plotIndex);
    sfx.plant();
    return new Promise(resolve => {
      this.tweens.add({
        targets: plot.cropText,
        alpha: 1,
        scale: 1,
        duration: ANIM.growBounce,
        ease: 'Back.out',
        onComplete: () => resolve(),
      });
    });
  }

  // Golden glow ring on a plot at harvest time — replaces the old gold fill
  // overlay so the crop image stays visible. Two stacked rings expand and fade
  // for a "ka-ching" pop without obscuring the plot contents.
  private spawnHarvestGlow(plotIndex: number) {
    const plot = this.plots[plotIndex];
    const cx = plot.container.x;
    const cy = plot.container.y;
    const baseSize = this.cfg.plotSize;

    for (let i = 0; i < 2; i++) {
      const ring = this.add.rectangle(cx, cy, baseSize + 4, baseSize + 4, 0xffd54f, 0);
      ring.setStrokeStyle(5, 0xffd54f, 0.95);
      ring.setDepth(195);
      this.tweens.add({
        targets: ring,
        scale: 1.4,
        alpha: 0,
        duration: 540,
        delay: i * 120,
        ease: 'Cubic.out',
        onComplete: () => ring.destroy(),
      });
    }
  }

  // Dirt-puff particles + dust cloud at the plot center. No texture needed —
  // each particle is a small Phaser shape with its own gravity-flavored tween.
  private spawnDirtVfx(plotIndex: number) {
    const plot = this.plots[plotIndex];
    const cx = plot.container.x;
    const cy = plot.container.y + 4;
    const depth = 200;

    // Brown dirt particles scatter outward + fall.
    const colors = [0x6b4423, 0x8d6e63, 0x5d4037, 0x795548, 0x4e342e];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const speed = Phaser.Math.FloatBetween(35, 70);
      const dx = Math.cos(angle) * speed;
      const dyInitial = Math.sin(angle) * speed - 25; // bias upward so it looks like it bursts up first
      const fallExtra = Phaser.Math.FloatBetween(20, 50);
      const size = Phaser.Math.Between(2, 5);
      const color = Phaser.Math.RND.pick(colors);
      const particle = this.add.circle(cx, cy, size, color).setDepth(depth);
      const duration = Phaser.Math.Between(420, 620);
      this.tweens.add({
        targets: particle,
        x: cx + dx,
        y: cy + dyInitial + fallExtra, // gravity-ish: ends below start
        alpha: 0,
        scale: 0.4,
        duration,
        ease: 'Cubic.out',
        onComplete: () => particle.destroy(),
      });
    }

    // Soft dust cloud expanding outward.
    const cloud = this.add.circle(cx, cy, 6, 0xc6a780, 0.55).setDepth(depth - 1);
    this.tweens.add({
      targets: cloud,
      scale: 5.5,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.out',
      onComplete: () => cloud.destroy(),
    });
  }

  // Animate a card flying from its current hand position to the plot center.
  // The container shrinks + fades during flight; resolves when it has landed.
  // Caller is responsible for destroying the container after.
  private animateCardToPlot(visual: CardVisual, plotIndex: number): Promise<void> {
    const plot = this.plots[plotIndex];
    return this.animateCardToPosition(visual, { x: plot.container.x, y: plot.container.y });
  }

  // Generalised card → world-position animation. Used for both seed→plot and
  // tool→center flights. Caller is responsible for destroying the container.
  private animateCardToPosition(
    visual: CardVisual,
    target: { x: number; y: number },
    opts?: { duration?: number; peakOffset?: number; scaleEnd?: number; alphaEnd?: number },
  ): Promise<void> {
    const startX = visual.container.x;
    const startY = visual.container.y;
    const startRot = visual.container.rotation;
    const startScale = visual.container.scaleX;
    const duration = opts?.duration ?? 360;
    const peakOffset = opts?.peakOffset ?? 90;
    const scaleEnd = opts?.scaleEnd ?? 0.45;
    const alphaEnd = opts?.alphaEnd ?? 0.35;
    const peakY = Math.min(startY, target.y) - peakOffset;

    visual.container.setDepth(400);
    const progress = { t: 0 };
    return new Promise(resolve => {
      this.tweens.add({
        targets: progress,
        t: 1,
        duration,
        ease: 'Cubic.in',
        onUpdate: () => {
          const t = progress.t;
          const inv = 1 - t;
          const midX = (startX + target.x) / 2;
          visual.container.x = inv * inv * startX + 2 * inv * t * midX + t * t * target.x;
          visual.container.y = inv * inv * startY + 2 * inv * t * peakY + t * t * target.y;
          visual.container.rotation = Phaser.Math.Linear(startRot, 0, t);
          visual.container.setScale(Phaser.Math.Linear(startScale, scaleEnd, t));
          visual.container.setAlpha(Phaser.Math.Linear(1.0, alphaEnd, t));
        },
        onComplete: () => resolve(),
      });
    });
  }

  // === Position helpers ===

  private centerPos(): { x: number; y: number } {
    const { width, height } = this.scale;
    return { x: width / 2, y: height / 2 - 20 };
  }

  private plotPos(plotIndex: number): { x: number; y: number } {
    const plot = this.plots[plotIndex];
    return { x: plot.container.x, y: plot.container.y };
  }

  // === Tool play sequence ===
  // Unified flow: card flies from wherever it currently is to the screen center,
  // tool action VFX + SFX play around the card, card disappears, then if the tool
  // targeted a plot we play a follow-up plot-specific VFX. Engine state was
  // already applied by runner.apply() — this is pure visual choreography.
  private async playToolFlow(
    visual: CardVisual,
    toolCardId: CardId,
    targetPlotIndex: number | undefined,
    events: RunEvent[],
  ): Promise<void> {
    // Detach from hand if still tracked there (click-play case). For drag-drop,
    // visual was never re-added after dragend — splice is a no-op.
    const idx = this.hand.indexOf(visual);
    if (idx >= 0) this.hand.splice(idx, 1);
    this.refanHand();
    this.refreshHud();

    // 1. Fly card to screen center.
    await this.animateCardToPosition(visual, this.centerPos(), {
      duration: 320,
      peakOffset: 70,
      scaleEnd: 0.75,
      alphaEnd: 0.95,
    });

    // 2. Play tool-specific VFX + SFX at the center, around the card.
    await this.playToolCenterVfx(toolCardId);

    // 3. Fade + destroy the card.
    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: visual.container,
        alpha: 0,
        scale: 0.4,
        duration: 180,
        ease: 'Cubic.in',
        onComplete: () => {
          visual.container.destroy();
          resolve();
        },
      });
    });

    // 4. If targeted, plot follow-up VFX + SFX.
    if (targetPlotIndex !== undefined) {
      await this.playToolPlotEffect(toolCardId, targetPlotIndex);
    }

    // 5. Fire remaining engine events. tool_used is filtered because we
    //    handled the visual sequence here; everything else (crop_ready,
    //    crop_harvested for Wheelbarrow, card_drawn from Garden Fork etc.) plays.
    const remaining = events.filter(e => e.kind !== 'tool_used');
    if (remaining.length > 0) {
      await this.playEventQueue(remaining);
    }
    this.syncSceneToEngine(true);
  }

  // Center VFX dispatcher: each tool gets a distinctive look + sound.
  // Returns when the visual feels "done" — caller can chain follow-up effects.
  private async playToolCenterVfx(toolCardId: CardId): Promise<void> {
    const pos = this.centerPos();
    switch (toolCardId) {
      case 'tool.watering_can':
        // Watering can has NO center VFX — the watering effect (spray + sound)
        // only plays on the targeted plot, in playToolPlotEffect. Spraying
        // water at the screen center looked disconnected from the actual plot
        // being watered.
        return;
      case 'tool.drip_line':
        sfx.water();
        await this.vfxWaterSpray(pos, { count: 18, spread: 90 });
        return;
      case 'tool.growth_potion':
        sfx.magic();
        await this.vfxSparkleBurst(pos, 0xce93d8, { count: 20 });
        return;
      case 'tool.fertilizer_bag':
        sfx.activate();
        await this.vfxSparkleBurst(pos, 0xa5d6a7);
        return;
      case 'tool.seed_vault':
        sfx.activate();
        await this.vfxSparkleBurst(pos, 0x90caf9);
        return;
      case 'tool.golden_trowel':
        sfx.magic();
        await this.vfxSparkleBurst(pos, 0xffd54f, { count: 22 });
        return;
      case 'tool.wheelbarrow':
        sfx.harvest();
        await this.vfxIconPulse(pos, '🛒', 0xa1887f);
        return;
      case 'tool.scarecrow':
        sfx.whoosh();
        await this.vfxIconPulse(pos, '🛡️', 0x90caf9);
        return;
      case 'tool.silver_hoe':
        sfx.whoosh();
        await this.vfxIconPulse(pos, '⛏', 0x8d6e63);
        return;
      case 'tool.compost_heap':
        sfx.whoosh();
        await this.vfxIconPulse(pos, '🪵', 0xa5d6a7);
        return;
      case 'tool.garden_fork':
        sfx.activate();
        await this.vfxIconPulse(pos, '🍴', 0xffd54f);
        return;
      case 'tool.rainbow_sprinkler':
        sfx.magic();
        // Rainbow: two staggered sparkle bursts in different colors.
        void this.vfxSparkleBurst(pos, 0xff80ab, { count: 16 });
        await this.vfxSparkleBurst(pos, 0x80deea, { count: 16 });
        return;
      case 'tool.market_bell':
        sfx.harvest();
        await this.vfxIconPulse(pos, '🔔', 0xffd54f);
        return;
      case 'tool.season_compass':
        sfx.activate();
        await this.vfxIconPulse(pos, '🧭', 0xce93d8);
        return;
      case 'tool.harvest_basket':
        sfx.harvest();
        await this.vfxIconPulse(pos, '🧺', 0xa5d6a7);
        return;
      default:
        sfx.activate();
        await this.vfxIconPulse(pos, '✨', 0xffd54f);
    }
  }

  // Plot follow-up effect: depicts the tool LANDING on the targeted plot.
  // Only called for tools that genuinely affect a specific plot.
  private async playToolPlotEffect(toolCardId: CardId, plotIndex: number): Promise<void> {
    const pos = this.plotPos(plotIndex);
    const plot = this.plots[plotIndex];

    switch (toolCardId) {
      case 'tool.watering_can':
        sfx.water();
        await this.vfxWaterSpray(pos, { count: 8, spread: 25 });
        // Refresh grow bar (engine already advanced grow).
        this.refreshGrowBar(plotIndex);
        // Crop bounces in response.
        if (plot.cropText.text) {
          this.tweens.add({
            targets: plot.cropText,
            scale: 1.25,
            duration: 160,
            yoyo: true,
            ease: 'Sine.inOut',
          });
        }
        return;
      case 'tool.growth_potion':
        sfx.magic();
        await this.vfxSparkleBurst(pos, 0xffd54f, { count: 18 });
        // Plot turns ready: bg color shift (handled by syncSceneToEngine,
        // but also flash the cropText brightly).
        this.refreshGrowBar(plotIndex);
        if (plot.cropText.text) {
          this.tweens.add({
            targets: plot.cropText,
            scale: 1.4,
            duration: 220,
            yoyo: true,
            ease: 'Back.out',
          });
        }
        return;
      case 'tool.wheelbarrow': {
        // Coins fly from the plot to the HUD coin counter.
        const target = { x: this.hudCoins.x, y: this.hudCoins.y };
        sfx.harvest();
        for (let i = 0; i < 6; i++) {
          const coin = this.add.text(pos.x, pos.y, '💰', { fontSize: '18px' })
            .setOrigin(0.5).setDepth(450);
          const peakY = Math.min(pos.y, target.y) - 70;
          const dx = (target.x - pos.x) * 0.5 + Phaser.Math.FloatBetween(-30, 30);
          const progress = { t: 0 };
          this.tweens.add({
            targets: progress,
            t: 1,
            duration: 480,
            delay: i * 50,
            ease: 'Cubic.in',
            onUpdate: () => {
              const t = progress.t;
              const inv = 1 - t;
              coin.x = inv * inv * pos.x + 2 * inv * t * (pos.x + dx) + t * t * target.x;
              coin.y = inv * inv * pos.y + 2 * inv * t * peakY + t * t * target.y;
              coin.setAlpha(1 - t * 0.5);
            },
            onComplete: () => coin.destroy(),
          });
        }
        await new Promise<void>(r => this.time.delayedCall(700, r));
        return;
      }
      default:
        // Fallback for any future targeted tool: subtle activate flash on the plot.
        sfx.activate();
        await this.vfxIconPulse(pos, '✨', 0xffd54f);
    }
  }

  // === Reusable VFX primitives ===

  private vfxWaterSpray(
    pos: { x: number; y: number },
    opts?: { count?: number; spread?: number },
  ): Promise<void> {
    const count = opts?.count ?? 12;
    const spread = opts?.spread ?? 35;
    const depth = 350;

    for (let i = 0; i < count; i++) {
      const dx = Phaser.Math.FloatBetween(-spread, spread);
      const startX = pos.x + dx;
      const startY = pos.y - 70;
      const drop = this.add.rectangle(startX, startY, 3, 9, 0x42a5f5, 0.92).setDepth(depth);
      this.tweens.add({
        targets: drop,
        y: pos.y + 8,
        alpha: 0.5,
        duration: 280 + Math.random() * 80,
        delay: Math.random() * 120,
        ease: 'Cubic.in',
        onComplete: () => {
          // Splash circle at landing.
          const splash = this.add.circle(drop.x, pos.y + 8, 3, 0x90caf9, 0.7).setDepth(depth - 1);
          this.tweens.add({
            targets: splash,
            scale: 3,
            alpha: 0,
            duration: 240,
            ease: 'Cubic.out',
            onComplete: () => splash.destroy(),
          });
          drop.destroy();
        },
      });
    }
    return new Promise(r => this.time.delayedCall(450, r));
  }

  private vfxSparkleBurst(
    pos: { x: number; y: number },
    color: number,
    opts?: { count?: number; spread?: number },
  ): Promise<void> {
    const count = opts?.count ?? 14;
    const spread = opts?.spread ?? 55;
    const depth = 350;

    // Center flash ring.
    const ring = this.add.circle(pos.x, pos.y, 12, color, 0.5).setDepth(depth - 1);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 380, ease: 'Cubic.out',
      onComplete: () => ring.destroy() });

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
      const dist = Phaser.Math.FloatBetween(spread * 0.6, spread);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const size = Phaser.Math.Between(2, 4);
      const p = this.add.circle(pos.x, pos.y, size, color, 0.95).setDepth(depth);
      this.tweens.add({
        targets: p,
        x: pos.x + dx,
        y: pos.y + dy,
        alpha: 0,
        scale: 0.3,
        duration: 460 + Math.random() * 140,
        ease: 'Cubic.out',
        onComplete: () => p.destroy(),
      });
    }
    return new Promise(r => this.time.delayedCall(420, r));
  }

  private vfxIconPulse(
    pos: { x: number; y: number },
    icon: string,
    color: number,
  ): Promise<void> {
    const depth = 350;
    const big = this.add.text(pos.x, pos.y, icon, { fontSize: '48px' })
      .setOrigin(0.5).setDepth(depth).setAlpha(0).setScale(0.5);
    this.tweens.add({ targets: big, scale: 1.2, alpha: 1, duration: 180, ease: 'Back.out' });
    this.tweens.add({
      targets: big,
      scale: 1.6,
      alpha: 0,
      delay: 220,
      duration: 240,
      ease: 'Cubic.out',
      onComplete: () => big.destroy(),
    });
    const ring = this.add.circle(pos.x, pos.y, 28, color, 0)
      .setStrokeStyle(3, color, 0.85).setDepth(depth - 1);
    this.tweens.add({ targets: ring, scale: 2.6, alpha: 0, duration: 420, ease: 'Cubic.out',
      onComplete: () => ring.destroy() });
    return new Promise(r => this.time.delayedCall(420, r));
  }

  private animateToolUsed(targetPlotIndex?: number): Promise<void> {
    if (targetPlotIndex === undefined) return Promise.resolve();
    const plot = this.plots[targetPlotIndex];
    this.refreshGrowBar(targetPlotIndex);
    return new Promise(resolve => {
      this.tweens.add({
        targets: plot.cropText,
        scale: 1.18,
        duration: 140,
        yoyo: true,
        ease: 'Cubic.out',
        onComplete: () => resolve(),
      });
    });
  }

  private animateGrowTick(plotIndex: number): Promise<void> {
    const plot = this.plots[plotIndex];
    this.refreshGrowBar(plotIndex);
    return new Promise(resolve => {
      this.tweens.add({
        targets: plot.cropText,
        scale: 1.1,
        duration: 180,
        yoyo: true,
        ease: 'Sine.inOut',
        onComplete: () => resolve(),
      });
    });
  }

  private animateReady(plotIndex: number): Promise<void> {
    const plot = this.plots[plotIndex];
    this.refreshGrowBar(plotIndex);

    // Apply the gold "ready" stroke immediately — the lerp is purely cosmetic
    // pulse on top. Plot fill stays brown so the crop image is fully visible.
    plot.bg.setStrokeStyle(4, 0xffd54f, 1);

    // Spawn a soft outer glow ring that pulses outward and fades. Lives just
    // for the ready animation so we don't accumulate sprites on every harvest.
    const ringSize = this.cfg.plotSize + 6;
    const glow = this.add.rectangle(plot.container.x, plot.container.y, ringSize, ringSize, 0xffd54f, 0);
    glow.setStrokeStyle(6, 0xffd54f, 0.85);
    glow.setDepth(180);

    return new Promise(resolve => {
      this.tweens.add({
        targets: glow,
        scale: 1.25,
        alpha: 0,
        duration: ANIM.readyGlow,
        ease: 'Cubic.out',
        onComplete: () => {
          glow.destroy();
          resolve();
        },
      });
      // Subtle stroke-alpha pulse so the new gold outline reads as "newly ripe".
      this.tweens.add({
        targets: { a: 1 },
        a: { from: 0.4, to: 1 },
        duration: ANIM.readyGlow / 2,
        yoyo: true,
        ease: 'Sine.inOut',
        onUpdate: tw => {
          const a = (tw.targets[0] as { a: number }).a;
          plot.bg.setStrokeStyle(4, 0xffd54f, a);
        },
      });
      // Pulse the crop emoji as it ripens.
      this.tweens.add({
        targets: plot.cropText,
        scale: 1.18,
        duration: ANIM.readyGlow / 2,
        yoyo: true,
        ease: 'Sine.inOut',
      });
    });
  }

  private animateHarvest(plotIndex: number, finalPrice: number): Promise<void> {
    const plot = this.plots[plotIndex];
    // Plot fill stays soil brown — the gold "ready" indicator is now an
    // outline, not a fill, so the crop image stays visible through harvest.
    plot.bg.setFillStyle(0x5a3a20, 0.7);
    plot.growBar.setVisible(false);
    plot.growBarBg.setVisible(false);

    // Golden glow outline pulse: an expanding gold ring around the plot to
    // celebrate the moment of harvest, decoupled from any fill overlay.
    this.spawnHarvestGlow(plotIndex);

    const startX = plot.container.x;
    const startY = plot.container.y;
    const target = { x: this.hudCoins.x, y: this.hudCoins.y };

    // Dirt burst + earthy thump: the crop is being pulled from the soil.
    this.spawnDirtVfx(plotIndex);
    sfx.plant();

    // Lift the plot above the dirt burst so the crop image isn't covered by
    // particles. syncPlotsToEngine restores depth on the next sync.
    plot.container.setDepth(250);
    plot.cropText.setAlpha(1);

    // Money flyer ONLY — no crop emoji copy. The crop image stays on the
    // plot the entire time and disappears the moment the price tag launches
    // toward the coin HUD, so the player perceives the crop converting into
    // money in place rather than two emojis being on screen at once.
    plot.cropText.setVisible(false);
    const flyer = this.add.container(startX, startY).setDepth(300);
    flyer.add(
      this.add
        .text(0, 0, `+${finalPrice}c`, {
          fontFamily: 'Fredoka One, cursive',
          fontSize: '22px',
          color: '#ffe082',
          stroke: '#3e2723',
          strokeThickness: 4,
        })
        .setOrigin(0.5),
    );

    return new Promise(resolve => {
      const peakY = Math.min(startY, target.y) - 60;
      const progress = { t: 0 };
      this.tweens.add({
        targets: progress,
        t: 1,
        duration: ANIM.harvestFly,
        ease: 'Cubic.in',
        onUpdate: () => {
          const t = progress.t;
          const inv = 1 - t;
          flyer.x = inv * inv * startX + 2 * inv * t * (startX + (target.x - startX) * 0.5) + t * t * target.x;
          flyer.y = inv * inv * startY + 2 * inv * t * peakY + t * t * target.y;
          flyer.setAlpha(1 - t * 0.6);
          flyer.setScale(1 - t * 0.5);
        },
        onComplete: () => {
          flyer.destroy();
          this.refreshHud();
          this.flashHud(this.hudCoins);
          resolve();
        },
      });
    });
  }

  private animateCombo(combo: 'onslaught' | 'triadic' | 'relentless'): Promise<void> {
    const labels: Record<typeof combo, { txt: string; color: string }> = {
      onslaught: { txt: '⚔️ ONSLAUGHT!', color: '#fca5a5' },
      triadic: { txt: '🌈 TRIADIC STRIKE!', color: '#80deea' },
      relentless: { txt: '🔁 RELENTLESS!', color: '#ddd6fe' },
    };
    const { width } = this.scale;
    const { plotsY } = this.layout;
    const label = this.add
      .text(width / 2, plotsY + this.cfg.plotSize / 2, labels[combo].txt, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: '24px',
        color: labels[combo].color,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(400)
      .setScale(0.4)
      .setAlpha(0);
    return new Promise(resolve => {
      this.tweens.add({
        targets: label,
        scale: 1.0,
        alpha: 1,
        duration: 200,
        ease: 'Back.out',
      });
      this.tweens.add({
        targets: label,
        y: label.y - 56,
        alpha: 0,
        delay: 360,
        duration: ANIM.comboPop - 360,
        ease: 'Cubic.out',
        onComplete: () => {
          label.destroy();
          resolve();
        },
      });
    });
  }

  private animateRoundLabel(round: number): Promise<void> {
    const { width, height } = this.scale;
    const label = this.add
      .text(width / 2, height / 2 - 40, `Turn ${round} / ${this.runner.state.totalRounds}`, {
        fontFamily: 'Fredoka One, cursive',
        fontSize: '34px',
        color: '#ffffff',
        stroke: '#1b3a1f',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(500)
      .setAlpha(0)
      .setScale(0.7);
    return new Promise(resolve => {
      this.tweens.add({
        targets: label,
        alpha: 1,
        scale: 1.0,
        duration: 200,
        ease: 'Back.out',
      });
      this.tweens.add({
        targets: label,
        alpha: 0,
        scale: 1.1,
        delay: ANIM.roundLabel - 200,
        duration: 240,
        onComplete: () => {
          label.destroy();
          resolve();
        },
      });
    });
  }

  // Big "Season Complete" banner that plays AFTER the final round's harvest
  // cascade finishes and BEFORE the results screen mounts. Two-line callout
  // with a subtitle that reads the player's final coin total so the
  // transition to results feels intentional rather than abrupt.
  private animateSeasonEndAnnouncement(): Promise<void> {
    const { width, height } = this.scale;
    const finalCoins = this.runner.state.coins;

    sfx.combo();

    const banner = this.add.container(width / 2, height / 2).setDepth(500);

    // Soft full-screen darken overlay so the banner pops.
    const dim = this.add.rectangle(0, 0, width * 2, height * 2, 0x000000, 0).setOrigin(0.5);
    banner.add(dim);

    const titleText = this.add.text(0, -36, '🌾 Season Complete 🌾', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '40px',
      color: '#ffd54f',
      stroke: '#1b3a1f',
      strokeThickness: 6,
    }).setOrigin(0.5);
    banner.add(titleText);

    const subText = this.add.text(0, 16, `Final harvest: 💰 ${finalCoins} coins`, {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '22px',
      color: '#ffffff',
      stroke: '#1b3a1f',
      strokeThickness: 4,
    }).setOrigin(0.5);
    banner.add(subText);

    const hintText = this.add.text(0, 50, 'Tallying your run…', {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '14px',
      color: '#fff8e1',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    banner.add(hintText);

    banner.setAlpha(0).setScale(0.7);

    return new Promise(resolve => {
      this.tweens.add({
        targets: dim,
        fillAlpha: 0.6,
        duration: 240,
      });
      this.tweens.add({
        targets: banner,
        alpha: 1,
        scale: 1.0,
        duration: 320,
        ease: 'Back.out',
      });
      // Hold long enough for the player to read both lines, then resolve so
      // App can swap to the results screen.
      this.time.delayedCall(2200, () => {
        this.tweens.add({
          targets: banner,
          alpha: 0,
          scale: 1.05,
          duration: 280,
          onComplete: () => {
            banner.destroy();
            resolve();
          },
        });
      });
    });
  }

  // === Order animations ===

  // Crop / water / combo just advanced an order. Plays a quick pop on the
  // matching order card and refreshes the panel from engine truth.
  private animateOrderProgress(orderId: string, _progress: number, _goal: number, fulfilledNow: boolean): Promise<void> {
    if (!this.ordersPanel) return Promise.resolve();
    this.ordersPanel.refresh(this.runner.state.orders);
    this.ordersPanel.pulseProgress(orderId);
    sfx.tick();
    if (fulfilledNow) {
      // Big celebratory chime layered on top of the tick. The full toast
      // banner is owned by animateOrderFulfilled which fires next.
      sfx.combo();
    }
    return new Promise(r => this.time.delayedCall(80, r));
  }

  // Big "Order Fulfilled!" banner + reward callout. Brief pause so the
  // player notices the bonus coins and the gold-flipping card.
  private animateOrderFulfilled(orderId: string, reward: number): Promise<void> {
    const target = this.ordersPanel?.positionOf(orderId);
    if (!target) return Promise.resolve();

    const { width } = this.scale;
    const banner = this.add.container(width / 2, target.y).setDepth(500);
    const bg = this.add.rectangle(0, 0, 320, 44, 0x2e7d32, 0.95);
    bg.setStrokeStyle(3, 0xffd54f, 1);
    banner.add(bg);
    const label = this.add.text(0, -8, '✅ ORDER FULFILLED', {
      fontFamily: 'Fredoka One, cursive',
      fontSize: '14px',
      color: '#ffd54f',
    }).setOrigin(0.5);
    banner.add(label);
    const sub = this.add.text(0, 8, `+${reward} bonus coins`, {
      fontFamily: 'Nunito, sans-serif',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    banner.add(sub);

    banner.setAlpha(0).setScale(0.7);
    return new Promise(resolve => {
      this.tweens.add({
        targets: banner,
        alpha: 1,
        scale: 1,
        duration: 240,
        ease: 'Back.out',
      });
      this.tweens.add({
        targets: banner,
        alpha: 0,
        y: banner.y - 28,
        delay: 900,
        duration: 280,
        onComplete: () => {
          banner.destroy();
          resolve();
        },
      });
    });
  }

  // === HUD ===

  private refreshHud() {
    const s = this.runner.state;
    this.hudRound.setText(`🌾 Round ${s.round} / ${s.totalRounds}`);
    this.hudCoins.setText(`💰 ${s.coins} coins`);
    this.hudLoyal.setText(s.relentlessStreak > 0 ? `🔁 Relentless ×${s.relentlessStreak}` : '');
    this.hudDeck.setText(`🃏 Deck ${s.deck.length}`);
    this.hudDiscard.setText(`Discard ${s.discard.length}`);

    // Hand counter: current / max. Color shifts as the hand approaches and
    // exceeds the cap so the discard-prompt trigger never feels surprising.
    if (this.handCounter) {
      const cur = s.hand.length;
      const cap = this.handCap;
      this.handCounter.setText(`✋ Hand ${cur} / ${cap}`);
      const color = cur > cap ? '#ff8a65' : cur === cap ? '#ffd54f' : '#ffffff';
      this.handCounter.setColor(color);
    }
  }

  private refreshGrowBar(plotIndex: number) {
    const plot = this.plots[plotIndex];
    const state = this.runner.state.plots[plotIndex];
    if (state.kind === 'empty') {
      plot.growBar.setVisible(false);
      plot.growBarBg.setVisible(false);
      return;
    }
    plot.growBar.setVisible(true);
    plot.growBarBg.setVisible(true);
    const card = getCard(state.crop.cardId) as SeedCard;
    const total = card.growRounds;
    const done = total - state.crop.growRoundsRemaining;
    const ratio = state.kind === 'ready' ? 1 : Math.max(0, Math.min(1, done / total));
    const barInset = Math.max(12, this.cfg.plotSize * 0.18);
    const barWidth = this.cfg.plotSize - barInset * 2;
    plot.growBar.setSize(barWidth * ratio, 5);
    plot.growBar.setFillStyle(state.kind === 'ready' ? 0xffd54f : 0x6ab47b);
  }

  private flashHud(target: Phaser.GameObjects.Text) {
    this.tweens.add({
      targets: target,
      scale: 1.25,
      duration: 120,
      yoyo: true,
      ease: 'Cubic.out',
    });
  }

  private rarityColor(r: SeedCard['rarity'] | ToolCard['rarity']): number {
    switch (r) {
      case 'common': return 0x6ab47b;
      case 'uncommon': return 0x64b5f6;
      case 'rare': return 0xba68c8;
      case 'epic': return 0xf4511e;
      case 'legendary': return 0xf9a825;
      case 'mythic': return 0xbf360c;
    }
  }

  // Window resize handling deferred to Phase 3: reposition HUD/end-round/deck pile
  // dynamically rather than restart the scene (restart loses run state and can't
  // be re-fed callback props from React without re-mounting the GameView component).
}
