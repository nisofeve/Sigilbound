// Sigilbound battle runner — the turn-based combat state machine.
//
// Replaces Plotbound's SeasonRunner conceptually but lives alongside it for
// now (Phase 2 = additive). Real wiring into the UI happens in Phase 5.
//
// Turn structure (per GDD §Gameplay Loop):
//   1. Player Plan Phase — drag Actions into Sigil Slots, play Tactics
//   2. End Turn — charge ticks, slots resolve L→R, combo check, damage out
//   3. Enemy Telegraph — chooseIntent for next turn (already done; refresh)
//   4. Enemy Resolve — each enemy executes its CURRENT intent
//   5. Status Tick — DoT damage, regen, decay
//   6. Win/Lose check; new draw if continuing
//
// We only model the engine-visible state here. Animations, UI sequencing,
// and Phaser tweens stay in scene code (Phase 5).

import { computeDamage } from './damage';
import {
  onslaughtMultiplier,
  relentlessMultiplier,
  triadicStrikeBonus,
  triadicStrikeMultiplier,
  relentlessStreakAfter,
} from './combos';
import { advanceCharge, chooseIntent } from './enemyAI';
import {
  applyEnemyDamage,
  isEnemyAlive,
  newEnemyState,
  setEnemyIntent,
  type EnemyDef,
  type EnemyState,
  type Intent,
} from './enemy';
import {
  addBlock,
  applyPlayerStatus,
  clearBlock,
  computePlayerStats,
  healPlayer,
  isAlive,
  newCombatant,
  takePlayerDamage,
  tickEndOfPlayerTurn,
  playerOutgoingMult,
  type PlayerCombatant,
  type PlayerStats,
} from './player';
import { createRng, type Rng } from './rng';
import {
  emptyReactions,
  fireReactions,
  type ActiveReactions,
  type ComboKind,
} from './reactions';
import {
  compileEquipment,
  type CompiledEquipment,
  type EquipmentTrigger,
  type EquippedSet,
} from './equipment';
import { getAction as getActionDef, getTactic as getTacticDef, type TacticEffect } from './actionCards';
import type { DamageType } from './damage';
import { clearSleepOnHit, applyStatus } from './status';
import type { CardId, Perk } from './types';
import { compileUpgradeBuffs, emptyUpgradeBuffs, type UpgradeBuffs } from './upgradeBuffs';

// === Action card (a strike-card on a sigil slot) ===
//
// Phase 4 will load the real card library; for the runner all we need is the
// shape of a placed action.

/**
 * UI-facing event log emitted by endTurn(). Lets the React layer animate
 * resolves and enemy actions in sequence rather than seeing them all flip
 * to their final state in one frame.
 *
 * Events are produced in the order they conceptually happen during the
 * turn, so the UI can replay them with delays + VFX.
 */
export type ResolveEvent =
  | {
      kind: 'action_resolve';
      slotIndex: number;            // which slot fired (snapshot at resolve time)
      cardId: string;
      damageType: DamageType;
      damageDealt: number;          // post-block HP delta on the target
      blockConsumed: number;
      wasCrit: boolean;
      resistMult: number;           // resistance multiplier applied (>1.4 = weakness, <0.7 = resisted)
      targetEnemyId: string | undefined;
      enemyHpBefore: number;
      enemyHpAfter: number;
      enemyKilled: boolean;
    }
  | { kind: 'combo'; combo: 'onslaught' | 'triadic' | 'relentless' }
  | {
      kind: 'enemy_attack';
      enemyId: string;
      damageType: DamageType;
      damageDealt: number;          // HP lost by player
      blockConsumed: number;
      playerHpBefore: number;
      playerHpAfter: number;
    }
  | {
      kind: 'enemy_block';
      enemyId: string;
      amount: number;
    }
  | {
      kind: 'enemy_debuff';
      enemyId: string;
      status: string;
    };

export interface ActionInstance {
  cardId: string;
  damage: number;             // raw, pre-buff
  damageType: DamageType;
  charge: number;             // turns remaining until resolve (0 = ready)
  hits?: number;              // multi-strike (e.g., Blade Dance: 3 hits)
  blockPiercing?: number;
  // Targeting: the enemy ID this action is aimed at. Re-routes if target
  // dies mid-resolution.
  targetEnemyId?: string;
  // The turn number this action was bound on. Used by the UI to allow
  // "take back" of a same-turn bind. Once endTurn runs, the bound action
  // is locked in and no longer matches state.turn.
  boundOnTurn?: number;
}

// === Battle state ===

export interface SigilSlot {
  index: number;
  bound: ActionInstance | null;
}

export interface BattleState {
  player: PlayerCombatant;
  enemies: EnemyState[];
  slots: SigilSlot[];
  reactions: ActiveReactions;
  // Combo carry-over — Relentless streak tracks ONE damage type across turns.
  relentlessStreak: number;
  relentlessType: DamageType | null;
  // Per-stage counters (seeded into the player combatant, but we also keep
  // turn-level totals for objective evaluation).
  turn: number;                  // 1-indexed
  combosTriggeredThisStage: { onslaught: number; triadic: number; relentless: number };
  outcome: 'in_progress' | 'cleared' | 'defeated';
  // Equipment-driven state. The runner reads `triggers` to apply on-event
  // bonuses (extra combo damage, low-HP revives) and tracks once-per-stage
  // consumption in `triggersFired`.
  equipment: {
    triggers: ReadonlyArray<EquipmentTrigger>;
    triggersFired: ReadonlyArray<number>;     // indices of triggers in `triggers` that have already fired (for oncePerStage)
    deckAdditions: ReadonlyArray<{ cardId: CardId; count: number }>;
    firstStrikeUsed: boolean;                 // for Hunter 4pc autoCrit
  };
  // Card flow (Phase 6 — replaces React-side hand bookkeeping).
  // Action + Tactic card ids only; Reaction cards live in `reactions`.
  hand: CardId[];
  deck: CardId[];           // top of deck = index 0
  discard: CardId[];
  // Per-turn stamina. Reset to stats.stamina at turn start; consumed by
  // tactic plays and (Phase 6+) action plays.
  staminaThisTurn: number;
  // Phase 6C: talent runtime state. Pre-compiled flags + counters so the
  // hot path (every strike, every combo) can read them in O(1).
  talents: {
    list: ReadonlyArray<Perk>;
    // Battlecry: +25% to the first action card resolved each turn.
    firstActionDamageBonus: number;       // 0 if Battlecry not equipped
    firstActionUsedThisTurn: boolean;
    // Damage-type bonus aggregated from talents that name a specific type.
    typeBonuses: Partial<Record<DamageType, number>>;
    // Aegis: first time HP would drop below threshold, gain block instead.
    aegisThreshold: number;               // 0 if not equipped
    aegisBlock: number;
    aegisFired: boolean;
    // Lucky Streak: crits restore HP.
    critHeal: number;
    // Sigilbound Master: combo damage bonuses doubled (multiplier on combo mult-1).
    allComboDamageMult: number;           // 1 if not equipped
    // Astral Convergence: every card has X% chance to replicate.
    cardReplicateChance: number;          // 0 if not equipped
    // Swift Recovery: heal N at end of clean turn.
    cleanTurnHeal: number;
    // Triple Threat: triadic damage +50%.
    triadicBonusPct: number;              // 0 if not equipped
    // Iron Discipline: block carries to next turn (capped). 0 = no carry.
    blockCarryCap: number;
    // Combo Cascade: +N draws + refund stamina on each combo.
    comboStaminaRefund: number;
    // Tactic Master: scale tactic numerics by 1+pct.
    tacticEffectMult: number;
    // Vigorous: heal N at start of each stage.
    stageStartHeal: number;
  };
  // Stronghold-upgrade runtime buffs. Compiled once at construction from
  // BattleConfig.ownedUpgradeIds — see upgradeBuffs.ts. The runner reads
  // these alongside `talents` at the relevant hot paths.
  upgradeBuffs: UpgradeBuffs;
  // Per-stage flag for Phoenix Ember (on_lethal_survive). Resets per battle.
  upgradeLethalSurviveUsed: boolean;
}

export interface BattleConfig {
  seed: number;
  // Either pass pre-computed stats directly (tests, replay), OR pass a level
  // and the runner will fold in `equipment` automatically. If both are given,
  // playerStats wins and `equipment` is treated as cosmetic-only (used for
  // deck/reaction/trigger compilation but not stats).
  playerStats?: PlayerStats;
  level?: number;
  equipment?: EquippedSet;
  enemyDefs: ReadonlyArray<EnemyDef>;
  startingActions?: ActionInstance[];          // pre-bound (e.g., Sigilbinder's Will)
  reactions?: ReadonlyArray<string>;           // reaction deck for this stage
  // Phase 6: explicit card lists for the run deck. If omitted, the runner
  // builds a minimal starter deck from equipment-driven additions plus a
  // small fallback (so tests + bare callers still work).
  deck?: ReadonlyArray<CardId>;
  // Initial hand size override. Defaults to playerStats.handSize (5 base).
  initialHandSize?: number;
  // Phase 6C: talents whose runtime effects the runner should honour.
  // These complement the stat-shaped modifiers folded by computePlayerStats
  // in the factory. Each `Perk` carries a `modifier` whose `type` the runner
  // pattern-matches on at the right moments (combo, crit, low-hp, …).
  talents?: ReadonlyArray<Perk>;
  // Phase 6E: Hardcore arc mode. When set, the player starts the stage at
  // `initialHp` instead of full. Used by the arc orchestrator to carry HP
  // forward across the 5-stage Hardcore run. Default mode (per-stage full
  // HP) leaves this undefined.
  initialHp?: number;
  // Whether this run is part of a Hardcore arc. Cosmetic for the runner —
  // the result-screen flow uses it to decide salvage rules.
  hardcore?: boolean;
  // Stronghold upgrades the player has bought. Combat-time effects (regen,
  // starting block, on-kill heal, etc.) are compiled into UpgradeBuffs at
  // construction and applied at the appropriate runner hooks.
  ownedUpgradeIds?: ReadonlyArray<string>;
}

// === Public API ===

export class BattleRunner {
  state: BattleState;
  private rng: Rng;
  private defs: Map<string, EnemyDef>;
  // Snapshot of damage-taken at the moment endTurn() began. Used by Swift
  // Recovery (clean-turn heal) to detect whether the player took damage
  // during the current turn.
  private damageTakenAtTurnStart: number = 0;

  // Event log accumulated during endTurn. Reset at the start of each
  // endTurn so the UI can read just the most recent turn's events.
  private resolveLog: ResolveEvent[] = [];

  /** Read-only view of events emitted by the most recent endTurn() call. */
  getLastResolveLog(): ReadonlyArray<ResolveEvent> {
    return this.resolveLog;
  }

  constructor(config: BattleConfig) {
    this.rng = createRng(config.seed);
    this.defs = new Map(config.enemyDefs.map(d => [d.id, d]));

    // Compile equipment if provided. Caller may pass either:
    //   - playerStats directly (tests, cloud replay)
    //   - level + equipment (production: storage layer hands these off)
    const compiled: CompiledEquipment | null = config.equipment
      ? compileEquipment(config.equipment)
      : null;

    const playerStats: PlayerStats = config.playerStats
      ?? computePlayerStats({ level: config.level ?? 1, modifiers: compiled?.modifiers ?? [] });

    const enemies: EnemyState[] = config.enemyDefs.map((def, i) =>
      newEnemyState(def, `${def.id}_${i}`),
    );

    const player = newCombatant(playerStats);
    // Hardcore: override starting HP if the arc orchestrator provided one.
    if (typeof config.initialHp === 'number') {
      player.currentHp = Math.max(0, Math.min(playerStats.maxHp, config.initialHp));
    }
    const slots: SigilSlot[] = Array.from({ length: playerStats.sigilSlots }, (_, i) => ({
      index: i,
      bound: null,
    }));

    // Apply pre-bound starting actions (e.g., Sigilbinder's Will).
    if (config.startingActions) {
      for (let i = 0; i < Math.min(slots.length, config.startingActions.length); i++) {
        slots[i].bound = config.startingActions[i];
      }
    }

    // Reactions — combine deck-stage reactions with equipment additions.
    const reactionIds = [
      ...(config.reactions ?? []),
      ...(compiled?.reactionAdditions ?? []),
    ];
    const reactions: ActiveReactions = reactionIds.length > 0
      ? { active: reactionIds, consumed: [] }
      : emptyReactions();

    // Build the run deck. Priority:
    //   1. Explicit `config.deck` if given (tests, replay, custom decks).
    //   2. Equipment deck additions (Iron Shortsword adds 2× Strike, etc.).
    //   3. A small starter fallback so bare callers still get a playable deck.
    const deckBuilder: CardId[] = [];
    if (config.deck && config.deck.length > 0) {
      deckBuilder.push(...config.deck);
    } else if (compiled?.deckAdditions && compiled.deckAdditions.length > 0) {
      for (const add of compiled.deckAdditions) {
        for (let i = 0; i < add.count; i++) deckBuilder.push(add.cardId);
      }
      // Augment with a small set of universal starters so the deck has
      // tactical variety even with a single weapon equipped.
      deckBuilder.push('act_001', 'act_001', 'tac_001', 'tac_002');
    } else {
      // Fallback starter — Strike, Slash, Block, Bandage, Brace.
      deckBuilder.push('act_001', 'act_001', 'act_002', 'act_002', 'tac_001', 'tac_002', 'tac_003');
    }

    // Shuffle deterministically using the seeded RNG so cloud replay matches.
    const shuffledDeck = this.rng.shuffle(deckBuilder);

    // Draw the opening hand.
    const handSize = config.initialHandSize ?? playerStats.handSize;
    const hand: CardId[] = [];
    const deck: CardId[] = [...shuffledDeck];
    for (let i = 0; i < handSize && deck.length > 0; i++) {
      hand.push(deck.shift()!);
    }

    // Compile talent runtime flags. Each known modifier kind maps to a
    // single field; unrecognised kinds are silent no-ops (additive scaling
    // pattern matches the existing engine — see types.ts comment).
    const talentList = config.talents ?? [];
    const compiledTalents = compileTalents(talentList);
    const upgradeBuffs = config.ownedUpgradeIds && config.ownedUpgradeIds.length > 0
      ? compileUpgradeBuffs(config.ownedUpgradeIds)
      : emptyUpgradeBuffs();

    // Stronghold "Quick Draw": draw N extra cards on the opening turn.
    // Bigger initial draw before the player ever sees the hand.
    if (upgradeBuffs.turnOneExtraDraw > 0) {
      for (let i = 0; i < upgradeBuffs.turnOneExtraDraw && deck.length > 0; i++) {
        hand.push(deck.shift()!);
      }
    }

    this.state = {
      player,
      enemies,
      slots,
      reactions,
      relentlessStreak: 0,
      relentlessType: null,
      turn: 1,
      combosTriggeredThisStage: { onslaught: 0, triadic: 0, relentless: 0 },
      outcome: 'in_progress',
      equipment: {
        triggers: compiled?.triggers ?? [],
        triggersFired: [],
        deckAdditions: compiled?.deckAdditions ?? [],
        firstStrikeUsed: false,
      },
      hand,
      deck,
      discard: [],
      staminaThisTurn: playerStats.stamina,
      talents: compiledTalents,
      upgradeBuffs,
      upgradeLethalSurviveUsed: false,
    };

    // Vigorous (talent) + stage_start_heal upgrades: heal at the start of
    // the stage. Both stack additively.
    const totalStageStartHeal = compiledTalents.stageStartHeal + upgradeBuffs.stageStartHeal;
    if (totalStageStartHeal > 0) {
      this.state.player = healPlayer(this.state.player, totalStageStartHeal);
    }

    // Stronghold "Shield Training": grant block at battle start.
    if (upgradeBuffs.startingBlock > 0) {
      this.state.player = addBlock(this.state.player, upgradeBuffs.startingBlock);
    }

    // Seed initial intents for all enemies (so the player sees telegraphs
    // before turn 1).
    this.refreshEnemyIntents();

    // Equipment on_stage_start triggers (block, heal).
    this.applyEquipmentStageStart();

    // Stage-start reactions (e.g., Sigilbinder's Will).
    this.fireReactionTrigger('onStageStart');
  }

  /** Compiled deck additions from equipment. UI / runner reads this on stage
   * start to seed the run deck with Iron Shortsword's bundled Quick Slashes,
   * etc. Pure getter — does not mutate state. */
  get equipmentDeckAdditions(): ReadonlyArray<{ cardId: CardId; count: number }> {
    return this.state.equipment.deckAdditions;
  }

  // === Card flow helpers (Phase 6) ===

  /** Draw N cards from the deck into the hand. Reshuffles discard into deck
   * when the deck runs dry. Returns the cards actually drawn (may be < n if
   * both deck and discard are empty). */
  drawCards(n: number): CardId[] {
    const drawn: CardId[] = [];
    for (let i = 0; i < n; i++) {
      if (this.state.deck.length === 0) {
        if (this.state.discard.length === 0) break;
        // Reshuffle discard into deck.
        this.state.deck = this.rng.shuffle(this.state.discard);
        this.state.discard = [];
      }
      const card = this.state.deck.shift();
      if (!card) break;
      this.state.hand.push(card);
      drawn.push(card);
    }
    return drawn;
  }

  /** Move a card from hand to discard (the most common discard path —
   * binding to a slot is a separate flow that goes through the slot first). */
  private discardFromHand(handIndex: number): CardId | null {
    if (handIndex < 0 || handIndex >= this.state.hand.length) return null;
    const [card] = this.state.hand.splice(handIndex, 1);
    this.state.discard.push(card);
    return card;
  }

  // === Player actions ===

  /** Bind a hand card into an empty sigil slot. Hand index resolves to the
   * card id; the runner builds the ActionInstance from the action def.
   * Returns true on success. (Action cards only — tactics use playTactic.) */
  bindHandToSlot(handIndex: number, slotIndex: number): boolean {
    const cardId = this.state.hand[handIndex];
    if (!cardId) return false;
    const def = getActionDef(cardId);
    if (!def) return false;
    const slot = this.state.slots[slotIndex];
    if (!slot || slot.bound) return false;
    const target = this.state.enemies.find(isEnemyAlive)?.id;
    slot.bound = {
      cardId: def.id,
      damage: def.damage,
      damageType: def.damageType,
      charge: def.charge,
      hits: def.hits,
      blockPiercing: def.blockPiercing,
      targetEnemyId: target,
      boundOnTurn: this.state.turn,
    };
    // Card leaves the hand. Bound cards live "on" the slot until they
    // resolve — at which point the runner pushes them to discard.
    this.state.hand.splice(handIndex, 1);
    return true;
  }

  /** Drag an action instance directly into a slot. Used by the React shell
   * for legacy compatibility. Phase 6 prefers `bindHandToSlot`. */
  bindToSlot(slotIndex: number, action: ActionInstance): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || slot.bound) return false;
    // Auto-target the leftmost living enemy if not specified.
    const target = action.targetEnemyId
      ?? this.state.enemies.find(isEnemyAlive)?.id;
    slot.bound = {
      ...action,
      targetEnemyId: target,
      boundOnTurn: action.boundOnTurn ?? this.state.turn,
    };
    return true;
  }

  /** Reassign an existing slot to a new target enemy. */
  retarget(slotIndex: number, enemyId: string): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || !slot.bound) return false;
    if (!this.state.enemies.some(e => e.id === enemyId && isEnemyAlive(e))) return false;
    slot.bound = { ...slot.bound, targetEnemyId: enemyId };
    return true;
  }

  /** Empty a slot (player undoes a bind during plan phase). The bound card
   * is discarded — does NOT return to hand. Use `returnSlotToHand` to undo
   * a same-turn bind without losing the card. */
  unbindSlot(slotIndex: number): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || !slot.bound) return false;
    slot.bound = null;
    return true;
  }

  /**
   * Predict which combos will fire if endTurn() is called right now and
   * which slot indices contribute to each. UI uses this during plan phase
   * to highlight bound slots that will participate in a combo before the
   * player commits.
   *
   * Only slots with charge 0 (or that will tick to 0 this turn) are
   * considered — anything still charging won't resolve so it's not part
   * of the current resolve set.
   */
  previewCombosForEndTurn(): {
    onslaught: number[];   // slot indices contributing to an Onslaught
    triadic: number[];     // slot indices contributing to a Triadic
    relentless: number[];  // slot indices contributing to a Relentless
  } {
    // Collect indices of slots that will resolve this turn. A slot resolves
    // if its current charge would tick to 0 — i.e. charge <= 1 at plan time.
    // (endTurn ticks all bound slots' charge by 1 before resolution.)
    const resolvingSlots: { idx: number; type: DamageType }[] = [];
    for (let si = 0; si < this.state.slots.length; si++) {
      const slot = this.state.slots[si];
      if (!slot.bound) continue;
      const willResolve = slot.bound.charge <= 1;
      if (willResolve) resolvingSlots.push({ idx: si, type: slot.bound.damageType });
    }

    if (resolvingSlots.length === 0) {
      return { onslaught: [], triadic: [], relentless: [] };
    }

    const counts = new Map<DamageType, number>();
    for (const s of resolvingSlots) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);

    const distinctCount = counts.size;
    const allOneType = distinctCount === 1;
    const carriedRelentless = allOneType
      && (this.state.relentlessType === null
        || this.state.relentlessType === resolvingSlots[0].type);

    // Onslaught: any damage type with >= 2 copies fires. Each contributing
    // slot is whichever slot has that damage type (could be multiple types
    // each with their own onslaught cluster).
    const onslaughtTypes = new Set<DamageType>();
    for (const [type, c] of counts.entries()) {
      if (c >= 2) onslaughtTypes.add(type);
    }
    const onslaughtSlots = resolvingSlots
      .filter(s => onslaughtTypes.has(s.type))
      .map(s => s.idx);

    // Triadic: 3+ distinct types — every resolving slot contributes.
    const triadicSlots = distinctCount >= 3 ? resolvingSlots.map(s => s.idx) : [];

    // Relentless: needs single type AND a prior streak (or fresh streak start
    // matching the prior type). UI shows the highlight even on fresh start
    // since the player benefits from building it.
    const relentlessSlots = (allOneType && (this.state.relentlessStreak > 0 || carriedRelentless))
      ? resolvingSlots.map(s => s.idx)
      : [];

    return { onslaught: onslaughtSlots, triadic: triadicSlots, relentless: relentlessSlots };
  }

  /** Returns true if a slot's bound card can be returned to hand: it was
   * bound on the current turn. Once endTurn runs, state.turn advances and
   * the card becomes locked in until it resolves. */
  canReturnSlotToHand(slotIndex: number): boolean {
    const slot = this.state.slots[slotIndex];
    if (!slot || !slot.bound) return false;
    return slot.bound.boundOnTurn === this.state.turn;
  }

  /** Return a same-turn bound card from a slot back to the player's hand.
   * Fails if the slot is empty or the card was bound on a previous turn. */
  returnSlotToHand(slotIndex: number): boolean {
    if (!this.canReturnSlotToHand(slotIndex)) return false;
    const slot = this.state.slots[slotIndex]!;
    const cardId = slot.bound!.cardId;
    slot.bound = null;
    this.state.hand.push(cardId);
    return true;
  }

  /** Play a Tactic card from hand. Resolves immediately, discards the card,
   * pays stamina cost. Returns the result outcome ('played' | 'cant_afford'
   * | 'invalid'). */
  playTactic(handIndex: number, targetEnemyId?: string): 'played' | 'cant_afford' | 'invalid' {
    const cardId = this.state.hand[handIndex];
    if (!cardId) return 'invalid';
    const def = getTacticDef(cardId);
    if (!def) return 'invalid';
    // Stronghold "Tactic Mastery" — discount tactic costs (min 0).
    const effectiveCost = Math.max(0, def.cost - this.state.upgradeBuffs.tacticStaminaDiscount);
    if (this.state.staminaThisTurn < effectiveCost) return 'cant_afford';

    // Pay stamina + discard.
    this.state.staminaThisTurn -= effectiveCost;
    this.discardFromHand(handIndex);

    this.applyTacticEffect(def.effect, targetEnemyId);
    return 'played';
  }

  /** Resolve a tactic effect against the current state. Visible internally
   * + to enable test scaffolding. */
  private applyTacticEffect(effect: TacticEffect, _targetEnemyId?: string): void {
    switch (effect.kind) {
      case 'block':
        this.state.player = addBlock(this.state.player, effect.amount);
        this.fireReactionTrigger('onBlockApplied');
        break;
      case 'heal':
        this.state.player = healPlayer(this.state.player, effect.amount);
        this.fireReactionTrigger('onHeal', { damage: effect.amount });
        break;
      case 'draw':
        this.drawCards(effect.cards);
        break;
      case 'gain_stamina':
        this.state.staminaThisTurn += effect.amount;
        break;
      case 'damage_buff':
        // Stored on the player as a transient status — we use the existing
        // outgoing-damage pipeline by stacking a one-turn flag. Phase 6
        // approximation: bump the player's atk for this turn; cleared at
        // end-of-turn alongside block.
        // (A real status would use the tickEndOfPlayerTurn decay, but the
        // current outgoingDamageMult only honours weakened. Adding a
        // dedicated 'damage_buff' status would require status-bag work; the
        // simpler path here is to bank the bonus on the player.)
        // For Phase 6, simply heal back equivalent stamina to indicate the
        // buff and document the gap — a TODO marker for Phase 6+.
        // TODO: wire damage_buff into outgoingDamageMult via a 'empowered'
        // status. Until then, War Cry effectively no-ops.
        void effect;
        break;
      case 'enemy_damage_debuff':
        // Apply Weakened to all living enemies — closest existing parallel.
        // Phase 6 tactics sweep will refine this once enemy status apply
        // hooks are wired.
        // No-op for now; tracked.
        break;
      case 'apply_status_self':
        this.state.player = applyPlayerStatus(this.state.player, effect.id, effect.stacks, effect.turns);
        break;
      case 'apply_status_all_enemies':
        // Apply to every living enemy.
        this.state.enemies = this.state.enemies.map(e =>
          isEnemyAlive(e) ? { ...e, statuses: { ...e.statuses, [effect.id]: { stacks: effect.stacks, turnsRemaining: effect.turns } } } : e,
        );
        break;
      case 'sigil_advance': {
        // Advance one charging sigil by N. If targetSigil set, target that
        // slot; otherwise advance the leftmost charging slot.
        const idx = effect.targetSigil ?? this.state.slots.findIndex(s => s.bound && s.bound.charge > 0);
        if (idx >= 0) {
          const slot = this.state.slots[idx];
          if (slot?.bound) {
            slot.bound = { ...slot.bound, charge: Math.max(0, slot.bound.charge - effect.amount) };
          }
        }
        break;
      }
      case 'sigil_clear_redraw': {
        const cleared = this.state.slots.filter(s => s.bound).length;
        for (const s of this.state.slots) s.bound = null;
        this.drawCards(cleared);
        break;
      }
      case 'instant_resolve_one_sigil': {
        // Set the leftmost charging sigil's charge to 0 so it resolves at
        // end of turn. (True "resolve immediately" would re-enter the resolve
        // pipeline mid-turn; that's complex and Phase 6 keeps it deferred.)
        const idx = this.state.slots.findIndex(s => s.bound && s.bound.charge > 0);
        if (idx >= 0) {
          const slot = this.state.slots[idx];
          if (slot?.bound) {
            slot.bound = { ...slot.bound, charge: 0 };
          }
        }
        break;
      }
      // Effects that need a UI hook (tutor, reveal, time-warp, mirror, astral)
      // are recognized at the type level but no-op at runtime here. Phase 6+.
      case 'duplicate_top_discard_action':
      case 'reveal_intents_all':
      case 'tutor_pick_one':
      case 'extra_turn':
      case 'reflect_next_attack':
      case 'all_cards_buffed_zero_cost':
      case 'extra_sigil_temp':
        break;
    }
  }

  /**
   * End the player's turn. Runs charge → resolve → combo → enemy turn →
   * status tick → win/lose check. Returns the outcome.
   */
  endTurn(): BattleState['outcome'] {
    if (this.state.outcome !== 'in_progress') return this.state.outcome;

    // Reset the resolve log for this turn — UI reads via getLastResolveLog().
    this.resolveLog = [];

    // Snapshot damage-taken so Swift Recovery can tell if this turn was clean.
    this.damageTakenAtTurnStart = this.state.player.damageTakenThisStage;

    // 1. Charge phase: tick down each bound slot.
    for (const slot of this.state.slots) {
      if (slot.bound && slot.bound.charge > 0) {
        slot.bound = { ...slot.bound, charge: slot.bound.charge - 1 };
      }
    }

    // 2. Resolution phase: slots with charge 0 fire L→R.
    // Track the source slotIndex per action so the UI can play VFX from
    // the right slot to the right enemy.
    const resolved: ActionInstance[] = [];
    const resolvedSlotIndices: number[] = [];
    for (let si = 0; si < this.state.slots.length; si++) {
      const slot = this.state.slots[si];
      if (slot.bound && slot.bound.charge <= 0) {
        resolved.push(slot.bound);
        resolvedSlotIndices.push(si);
        slot.bound = null;
      }
    }
    if (resolved.length > 0) {
      this.computeAndApplyResolves(resolved, resolvedSlotIndices);
      for (const action of resolved) {
        this.state.discard.push(action.cardId);
      }
    }

    if (this.checkOutcome()) return this.state.outcome;

    // 3. Enemy turn: each living enemy executes its current intent.
    for (const enemy of this.state.enemies) {
      if (!isEnemyAlive(enemy)) continue;
      this.executeEnemyIntent(enemy);
      if (this.state.outcome !== 'in_progress') return this.state.outcome;
    }

    // 4. Status tick on player (DoT damage, regen, decay).
    const tick = tickEndOfPlayerTurn(this.state.player);
    this.state.player = tick.combatant;
    if (this.checkOutcome()) return this.state.outcome;

    // Stronghold Meditation: passive HP regen each turn.
    if (this.state.upgradeBuffs.regenPerTurn > 0) {
      this.state.player = healPlayer(this.state.player, this.state.upgradeBuffs.regenPerTurn);
    }

    // Talent: Swift Recovery — heal at end of clean turn (no HP lost).
    // We use the per-turn `damageTakenThisStage` delta as the proxy:
    // it's only updated by takePlayerDamage and DoT ticks, so if it
    // didn't change since this turn started we're "clean".
    const cleanTurnHeal = this.state.talents.cleanTurnHeal;
    if (cleanTurnHeal > 0 && this.damageTakenAtTurnStart === this.state.player.damageTakenThisStage) {
      this.state.player = healPlayer(this.state.player, cleanTurnHeal);
    }

    // Block: default = reset; talents OR Stronghold Resilience carry up to N.
    const carryCap = Math.max(this.state.talents.blockCarryCap, this.state.upgradeBuffs.blockCarryCap);
    if (carryCap > 0) {
      const carried = Math.min(this.state.player.block, carryCap);
      this.state.player = { ...this.state.player, block: carried };
    } else {
      this.state.player = clearBlock(this.state.player);
    }

    // Reset Battlecry's per-turn flag so the next turn's first action gets
    // the bonus again.
    if (this.state.talents.firstActionUsedThisTurn) {
      this.state.talents = { ...this.state.talents, firstActionUsedThisTurn: false };
    }

    // 5. Refresh enemy intents for the NEXT turn.
    for (const enemy of this.state.enemies) {
      if (!isEnemyAlive(enemy)) continue;
      enemy.turnsTaken += 1;
      const def = this.defs.get(enemy.defId);
      if (!def) continue;
      const intent = chooseIntent(def, enemy, this.rng);
      this.state.enemies = this.state.enemies.map(e =>
        e.id === enemy.id ? setEnemyIntent(e, intent) : e,
      );
    }

    // 6. End-of-turn card flow (Phase 6): unspent hand goes to discard, draw
    // a fresh hand for next turn, reset stamina. This mirrors Slay-the-Spire's
    // discard-all-on-end pattern. Players who want to "save" cards across
    // turns must bind them to slots (action) or play them (tactic) this turn.
    while (this.state.hand.length > 0) {
      this.state.discard.push(this.state.hand.shift()!);
    }
    this.drawCards(this.state.player.stats.handSize);
    this.state.staminaThisTurn = this.state.player.stats.stamina;

    this.state.turn += 1;
    return this.state.outcome;
  }

  // === Internal ===

  /** Fire all on_stage_start equipment triggers (called once in constructor). */
  private applyEquipmentStageStart(): void {
    const fired: number[] = [];
    this.state.equipment.triggers.forEach((t, idx) => {
      if (t.kind !== 'on_stage_start') return;
      if (t.addBlock) this.state.player = addBlock(this.state.player, t.addBlock);
      if (t.healHp) this.state.player = healPlayer(this.state.player, t.healHp);
      fired.push(idx);
    });
    if (fired.length > 0) {
      this.state.equipment = {
        ...this.state.equipment,
        triggersFired: [...this.state.equipment.triggersFired, ...fired],
      };
    }
  }

  /** Aggregate damage-type bonus from equipment (e.g., Phoenix Signet
   * +10% Pyre). Combo damage already passes through outgoingDamageMult; this
   * is multiplicative on top for the matching damage type. */
  private equipmentTypeBonus(type: DamageType): number {
    let mult = 1;
    for (const t of this.state.equipment.triggers) {
      if (t.kind === 'damage_type_bonus' && t.type === type) {
        mult *= 1 + t.pct;
      }
    }
    return mult;
  }

  /** Aggregate global damage bonus from equipment that fired on a combo.
   * E.g. Sigilbound 4pc adds +50% on every onslaught. */
  private equipmentComboBonus(combo: ComboKind): number {
    let pct = 0;
    for (const t of this.state.equipment.triggers) {
      if (t.kind === 'on_combo' && t.combo === combo && t.bonusDamagePct) {
        pct += t.bonusDamagePct;
      }
    }
    return pct;
  }

  /** Apply on_kill heal/gold triggers. */
  private applyEquipmentOnKill(): void {
    for (const t of this.state.equipment.triggers) {
      if (t.kind !== 'on_kill') continue;
      if (t.healHp) this.state.player = healPlayer(this.state.player, t.healHp);
      // Gold drops are settled at end of stage by the surrounding game flow,
      // not the runner. We only track the trigger fired.
    }
  }

  /** Apply on_combo heal triggers (e.g., Drakehide Plate +5 HP per Onslaught). */
  private applyEquipmentOnCombo(combo: ComboKind): void {
    for (const t of this.state.equipment.triggers) {
      if (t.kind !== 'on_combo' || t.combo !== combo) continue;
      if (t.healHp) this.state.player = healPlayer(this.state.player, t.healHp);
    }
  }

  /** Check if Phoenix 2pc / similar low-HP trigger should fire. Returns true
   * if a revive happened (caller should treat the lethal hit as survived). */
  private applyEquipmentLowHp(): boolean {
    for (let idx = 0; idx < this.state.equipment.triggers.length; idx++) {
      const t = this.state.equipment.triggers[idx];
      if (t.kind !== 'on_low_hp') continue;
      if (t.oncePerStage && this.state.equipment.triggersFired.includes(idx)) continue;
      const ratio = this.state.player.currentHp / Math.max(1, this.state.player.stats.maxHp);
      if (ratio >= t.threshold) continue;
      // Eligible — apply.
      if (t.addBlock) this.state.player = addBlock(this.state.player, t.addBlock);
      if (t.reviveAtHpPct) {
        const reviveHp = Math.max(1, Math.floor(this.state.player.stats.maxHp * t.reviveAtHpPct));
        this.state.player = { ...this.state.player, currentHp: Math.max(this.state.player.currentHp, reviveHp) };
      }
      this.state.equipment = {
        ...this.state.equipment,
        triggersFired: [...this.state.equipment.triggersFired, idx],
      };
      return true;
    }
    return false;
  }

  /** Check whether the next strike should auto-crit (Hunter 4pc). Mutates
   * `firstStrikeUsed` so subsequent strikes don't re-fire. */
  private consumeFirstStrikeAutoCrit(): boolean {
    if (this.state.equipment.firstStrikeUsed) return false;
    const has = this.state.equipment.triggers.some(t => t.kind === 'on_first_strike_per_stage' && t.autoCrit);
    if (!has) return false;
    this.state.equipment = { ...this.state.equipment, firstStrikeUsed: true };
    return true;
  }

  private refreshEnemyIntents(): void {
    this.state.enemies = this.state.enemies.map(e => {
      if (!isEnemyAlive(e)) return e;
      const def = this.defs.get(e.defId);
      if (!def) return e;
      return setEnemyIntent(e, chooseIntent(def, e, this.rng));
    });
  }

  private computeAndApplyResolves(
    resolvedReadonly: ReadonlyArray<ActionInstance>,
    slotIndices: ReadonlyArray<number> = [],
  ): void {
    let resolved: ActionInstance[] = [...resolvedReadonly];
    // Parallel array of slot indices — kept in lockstep through replication
    // below so each emitted resolve event carries the right source slot.
    let resolvedSlots: number[] = [...slotIndices];
    while (resolvedSlots.length < resolved.length) resolvedSlots.push(-1);
    // Group by damage type for combo evaluation.
    const counts = new Map<DamageType, number>();
    for (const a of resolved) {
      counts.set(a.damageType, (counts.get(a.damageType) ?? 0) + 1);
    }

    const distinctCount = counts.size;
    const allOneType = distinctCount === 1;
    const carriedRelentless = allOneType
      && (this.state.relentlessType === null
        || this.state.relentlessType === resolved[0].damageType);

    const triadicBonus = triadicStrikeBonus(distinctCount);
    const triadicMult = triadicStrikeMultiplier(distinctCount);

    const outgoingMult = playerOutgoingMult(this.state.player);

    // Equipment-side combo bonuses (Sigilbound 4pc +50% on onslaught, etc).
    // Aggregated once per resolve set since combos are per-resolve.
    const onslaughtFired = Array.from(counts.values()).some(c => c >= 2);
    const eqOnslaught = onslaughtFired ? this.equipmentComboBonus('onslaught') : 0;
    const eqTriadic = triadicBonus > 0 ? this.equipmentComboBonus('triadic') : 0;
    const eqRelentless = carriedRelentless && this.state.relentlessStreak > 0
      ? this.equipmentComboBonus('relentless')
      : 0;
    const equipmentComboMult = 1 + eqOnslaught + eqTriadic + eqRelentless;

    // Talent-side combo math (Phase 6C):
    //   - Sigilbound Master: combo damage bonuses doubled. Applied as a
    //     scaler on the (mult - 1) portion so 1.0× combos stay neutral.
    //   - Triple Threat: triadic damage +50%.
    const t = this.state.talents;
    const buffs = this.state.upgradeBuffs;
    // Both talents and Stronghold "Sigilbound Master" can scale combo bonuses.
    const allComboScale = Math.max(t.allComboDamageMult, buffs.allComboDamageMult);
    const talentComboScale = (mult: number) => 1 + (mult - 1) * allComboScale;
    const triadicTalentMult = 1 + (triadicBonus > 0 ? t.triadicBonusPct : 0);
    // Stronghold "Combo Mastery": flat additive bonus to every combo strike.
    const upgradeComboBonusMult = 1 + buffs.comboDamageBonus;

    // Astral Convergence (talent) + Echo Sigil / Astral Pact (upgrades):
    // chance per action to resolve twice. Both stack additively, capped at 1.
    const replicateChance = Math.min(1, t.cardReplicateChance + buffs.cardReplicateChance);
    if (replicateChance > 0) {
      const expanded: ActionInstance[] = [];
      const expandedSlots: number[] = [];
      for (let i = 0; i < resolved.length; i++) {
        expanded.push(resolved[i]);
        expandedSlots.push(resolvedSlots[i]);
        if (this.rng.next() < replicateChance) {
          expanded.push({ ...resolved[i] });
          expandedSlots.push(resolvedSlots[i]); // replicas share the source slot
        }
      }
      resolved = expanded;
      resolvedSlots = expandedSlots;
      counts.clear();
      for (const a of resolved) {
        counts.set(a.damageType, (counts.get(a.damageType) ?? 0) + 1);
      }
    }

    // Apply each strike. Combo bonuses fold into the raw damage; the damage
    // pipeline then resolves block/def/resistances at the target.
    for (let i = 0; i < resolved.length; i++) {
      const action = resolved[i];
      const sourceSlotIdx = resolvedSlots[i] ?? -1;
      const same = counts.get(action.damageType) ?? 1;
      const onMult = talentComboScale(onslaughtMultiplier(same));
      const reMult = carriedRelentless ? talentComboScale(relentlessMultiplier(this.state.relentlessStreak)) : 1;
      const eqTypeMult = this.equipmentTypeBonus(action.damageType);
      // Talent + upgrade damage_type_bonus stack additively, multiplicative on raw.
      const talentTypeMult = 1
        + (t.typeBonuses[action.damageType] ?? 0)
        + (buffs.damageTypeBonus[action.damageType] ?? 0);
      // Battlecry (talent) + Stronghold's Battlecry upgrade — first action
      // card each turn gains +pct. Sources stack additively for the bonus.
      const firstActionBonus = t.firstActionDamageBonus + buffs.firstActionDamageBonus;
      const battlecryMult = !t.firstActionUsedThisTurn && firstActionBonus > 0
        ? (1 + firstActionBonus)
        : 1;
      if (battlecryMult > 1) {
        this.state.talents = { ...t, firstActionUsedThisTurn: true };
      }
      // Triadic stacks two ways:
      //   - flat add (triadicBonus, +30 per strike when 3+ types resolve)
      //   - multiplier (triadicMult, +25% per strike) folded into the buff
      // chain alongside Onslaught/Relentless/equipment/talent multipliers.
      const buffedRaw = Math.round(
        action.damage * onMult * reMult * triadicMult * outgoingMult * equipmentComboMult * eqTypeMult * talentTypeMult * battlecryMult * triadicTalentMult * upgradeComboBonusMult,
      ) + triadicBonus;

      // Look up the card def once per action for AOE + self-effect data.
      const cardDef = getActionDef(action.cardId);
      const isAoe = cardDef?.aoe === true;

      // Build target list: AOE = all living enemies; otherwise single target.
      const targets = isAoe
        ? this.state.enemies.filter(isEnemyAlive)
        : [this.findLivingTarget(action.targetEnemyId)].filter((t): t is NonNullable<typeof t> => !!t);

      if (targets.length === 0) continue; // no enemies left — strike wasted

      // Hunter 4pc: first strike of stage auto-crits.
      const autoCrit = this.consumeFirstStrikeAutoCrit();
      const critChance = autoCrit ? 1 : this.state.player.stats.critChance;

      let firstTarget = targets[0];

      for (const target of targets) {
        const targetHpBefore = target.currentHp;
        const critRoll = autoCrit ? 0 : this.rng.next();

        // Stronghold "Critical Mastery" raises the base 1.5× crit multiplier.
        const critBonus = 1.5 + buffs.critDamageBonus;
        // Action piercing + Stronghold "Armor Piercer" stack additively, capped at 1.
        const totalPiercing = Math.min(1, (action.blockPiercing ?? 0) + buffs.globalBlockPiercing);

        const result = computeDamage({
          raw: buffedRaw,
          type: action.damageType,
          attackerAtk: this.state.player.stats.atk,
          attackerCritChance: critChance,
          attackerCritBonus: critBonus,
          defenderDef: target.def,
          defenderBlock: target.block,
          defenderResistances: target.resistances,
          critRoll,
          blockPiercing: totalPiercing,
        });

        // Clear sleep on hit.
        this.state.enemies = this.state.enemies.map(e =>
          e.id === target.id
            ? { ...applyEnemyDamage(e, result.hpDelta, result.blockConsumed),
                statuses: clearSleepOnHit(e.statuses) }
            : e,
        );

        // Apply on-hit statuses (single or multiple) from the card def.
        const allStatuses = [
          ...(cardDef?.applyStatus ? [cardDef.applyStatus] : []),
          ...(cardDef?.applyStatuses ?? []),
        ];
        for (const s of allStatuses) {
          this.state.enemies = this.state.enemies.map(e =>
            e.id === target.id
              ? { ...e, statuses: applyStatus(e.statuses, s.id, s.stacks, s.turns) }
              : e,
          );
        }

        const updatedTarget = this.state.enemies.find(e => e.id === target.id);
        const targetHpAfter = updatedTarget?.currentHp ?? targetHpBefore;

        // Track player stats.
        this.state.player = {
          ...this.state.player,
          damageDealtThisStage: this.state.player.damageDealtThisStage + result.hpDelta,
          damageDealtByType: {
            ...this.state.player.damageDealtByType,
            [action.damageType]: (this.state.player.damageDealtByType[action.damageType] ?? 0) + result.hpDelta,
          },
        };

        if (result.wasCrit) {
          this.fireReactionTrigger('onCrit', { damage: result.hpDelta, damageType: action.damageType });
          if (this.state.talents.critHeal > 0) {
            this.state.player = healPlayer(this.state.player, this.state.talents.critHeal);
          }
        }
        const afterState = this.state.enemies.find(e => e.id === target.id);
        const wasKill = !!(afterState && !isEnemyAlive(afterState));
        if (wasKill) {
          this.state.player = { ...this.state.player, enemiesDefeated: this.state.player.enemiesDefeated + 1 };
          this.fireReactionTrigger('onKill', { victimEnemyId: target.id });
          this.applyEquipmentOnKill();
          // Self-heal on kill.
          if (cardDef?.selfHealOnKill && cardDef.selfHealOnKill > 0) {
            this.state.player = healPlayer(this.state.player, cardDef.selfHealOnKill);
          }
          // Stronghold "Life Drain" — passive heal per kill.
          if (this.state.upgradeBuffs.onKillHeal > 0) {
            this.state.player = healPlayer(this.state.player, this.state.upgradeBuffs.onKillHeal);
          }
        }

        // Emit per-target resolve event.
        this.resolveLog.push({
          kind: 'action_resolve',
          slotIndex: sourceSlotIdx,
          cardId: action.cardId,
          damageType: action.damageType,
          damageDealt: result.hpDelta,
          blockConsumed: result.blockConsumed,
          wasCrit: result.wasCrit,
          resistMult: result.resistMult,
          targetEnemyId: target.id,
          enemyHpBefore: targetHpBefore,
          enemyHpAfter: targetHpAfter,
          enemyKilled: wasKill,
        });

        if (target.id === firstTarget.id) {
          firstTarget = this.state.enemies.find(e => e.id === target.id) ?? firstTarget;
        }
      }

      // Self-effects fire once per card (not per AOE target).
      if (cardDef?.selfBlock && cardDef.selfBlock > 0) {
        this.state.player = addBlock(this.state.player, cardDef.selfBlock);
      }
      if (cardDef?.selfHeal && cardDef.selfHeal > 0) {
        this.state.player = healPlayer(this.state.player, cardDef.selfHeal);
      }
      if (cardDef?.selfDrawCard && cardDef.selfDrawCard > 0) {
        this.drawCards(cardDef.selfDrawCard);
      }
      if (cardDef?.selfDamageBuff) {
        this.state.player = applyPlayerStatus(
          this.state.player,
          'empowered',
          Math.round(cardDef.selfDamageBuff.pct * 10),
          cardDef.selfDamageBuff.turns,
        );
      }
    }

    // Combo bookkeeping.
    if (counts.size > 0) {
      const triadicFired = triadicBonus > 0;
      const relentlessFired = carriedRelentless && this.state.relentlessStreak > 0;
      if (onslaughtFired) {
        this.fireComboReaction('onslaught');
        this.applyEquipmentOnCombo('onslaught');
        this.resolveLog.push({ kind: 'combo', combo: 'onslaught' });
      }
      if (triadicFired) {
        this.fireComboReaction('triadic');
        this.applyEquipmentOnCombo('triadic');
        this.resolveLog.push({ kind: 'combo', combo: 'triadic' });
      }
      if (relentlessFired) {
        this.fireComboReaction('relentless');
        this.applyEquipmentOnCombo('relentless');
        this.resolveLog.push({ kind: 'combo', combo: 'relentless' });
      }
    }

    // Update relentless streak for next turn.
    const types = resolved.map(a => a.damageType);
    const r = relentlessStreakAfter(this.state.relentlessStreak, types as never);
    // We coerce to any because relentlessStreakAfter was written for crop
    // types; the data shape is identical (string identity), so reuse is safe.
    this.state.relentlessStreak = r.streak;
    this.state.relentlessType = allOneType ? resolved[0].damageType : null;
  }

  private findLivingTarget(preferredId: string | undefined): EnemyState | undefined {
    if (preferredId) {
      const e = this.state.enemies.find(en => en.id === preferredId && isEnemyAlive(en));
      if (e) return e;
    }
    // Cascade to leftmost living.
    return this.state.enemies.find(isEnemyAlive);
  }

  private executeEnemyIntent(enemy: EnemyState): void {
    // Charges advance toward their payload.
    const intent = advanceCharge(enemy.intent);
    if (intent.kind === 'charge') {
      // Still charging; just store the decremented charge for visibility.
      this.state.enemies = this.state.enemies.map(e =>
        e.id === enemy.id ? setEnemyIntent(e, intent) : e,
      );
      return;
    }

    switch (intent.kind) {
      case 'attack':
        this.applyEnemyAttack(enemy, intent);
        break;
      case 'block':
        this.state.enemies = this.state.enemies.map(e =>
          e.id === enemy.id ? { ...e, block: e.block + intent.amount } : e,
        );
        this.resolveLog.push({ kind: 'enemy_block', enemyId: enemy.id, amount: intent.amount });
        break;
      case 'debuff':
        this.state.player = applyPlayerStatus(this.state.player, intent.status, intent.stacks, intent.turns);
        this.resolveLog.push({ kind: 'enemy_debuff', enemyId: enemy.id, status: intent.status });
        break;
      case 'summon':
        // Phase 4 will hook this up to the bestiary; for now no-op.
        break;
      case 'hidden':
        // Mythic boss only — Phase 4.
        break;
    }
  }

  private applyEnemyAttack(enemy: EnemyState, intent: Intent & { kind: 'attack' }): void {
    const hits = intent.hits ?? 1;
    for (let i = 0; i < hits; i++) {
      // onAttackIncoming reactions (Parry, Dodge, Counterstrike).
      const incomingPatch = this.fireReactionTrigger('onAttackIncoming', {
        damage: intent.damage,
        damageType: intent.type,
        source: 'enemy',
      });

      let raw = intent.damage;
      if (incomingPatch.cancelIncomingDamage) raw = 0;
      if (incomingPatch.reduceIncomingDamageBy) raw = Math.max(0, raw - incomingPatch.reduceIncomingDamageBy);
      if (incomingPatch.reduceIncomingDamagePct) raw = Math.round(raw * (1 - incomingPatch.reduceIncomingDamagePct));

      // Aegis (talent + Stronghold "Aegis" upgrade): first time this stage HP
      // would drop below threshold, gain block instead. Both sources fold
      // into a single trigger that fires once per stage.
      const tal = this.state.talents;
      const aegisBuffs = this.state.upgradeBuffs;
      const totalAegisThreshold = Math.max(tal.aegisThreshold, aegisBuffs.aegisThreshold);
      const totalAegisBlock = Math.max(tal.aegisBlock, aegisBuffs.aegisBlock);
      if (!tal.aegisFired && totalAegisThreshold > 0) {
        const projectedHp = this.state.player.currentHp - Math.max(0, raw - this.state.player.block - this.state.player.stats.def);
        if (projectedHp / Math.max(1, this.state.player.stats.maxHp) < totalAegisThreshold) {
          this.state.player = addBlock(this.state.player, totalAegisBlock);
          this.state.talents = { ...tal, aegisFired: true };
        }
      }

      const before = this.state.player;
      const playerHpBefore = before.currentHp;
      // Enemy intents from the AI already fold atk into the damage value
      // (e.g., brute attack = atk * 1.5). Pass 0 to avoid double-counting.
      const { combatant, result } = takePlayerDamage(before, {
        raw,
        type: intent.type,
        attackerAtk: 0,
        blockPiercing: intent.piercing,
      });
      // Stronghold "Phoenix Ember" — once per stage, survive a lethal hit
      // restored to 1 HP. Apply BEFORE writing back to state.player so the
      // resolveLog reflects the survived HP.
      let finalCombatant = combatant;
      if (
        combatant.currentHp === 0
        && !this.state.upgradeLethalSurviveUsed
        && this.state.upgradeBuffs.onLethalSurvive > 0
      ) {
        finalCombatant = { ...combatant, currentHp: 1 };
        this.state.upgradeLethalSurviveUsed = true;
      }
      this.state.player = finalCombatant;

      this.resolveLog.push({
        kind: 'enemy_attack',
        enemyId: enemy.id,
        damageType: intent.type,
        damageDealt: result.hpDelta,
        blockConsumed: result.blockConsumed,
        playerHpBefore,
        playerHpAfter: finalCombatant.currentHp,
      });

      // onLethal: damage that would kill — fire BEFORE applying. We approximate
      // by checking after: if HP just hit 0 and we have phoenix_heart available,
      // re-fire that reaction by reverting and re-applying.
      if (finalCombatant.currentHp === 0) {
        const lethalPatch = this.fireReactionTrigger('onLethal');
        if (lethalPatch.surviveAtHp && lethalPatch.surviveAtHp > 0) {
          this.state.player = { ...finalCombatant, currentHp: lethalPatch.surviveAtHp };
        }
        // Equipment-driven low-HP revives (Phoenix 2pc). Only fires once per
        // stage. Check AFTER reactions so reaction-driven survival wins ties.
        if (this.state.player.currentHp === 0) {
          this.applyEquipmentLowHp();
        }
      }

      // onAttackResolved + low-HP triggers.
      this.fireReactionTrigger('onAttackResolved', { damage: result.hpDelta });
      if (this.state.player.currentHp / Math.max(1, this.state.player.stats.maxHp) < 0.25) {
        this.fireReactionTrigger('onLowHp');
      }

      // Counterstrike reflect — applied to the attacking enemy.
      if (incomingPatch.reflectDamageTo) {
        this.state.enemies = this.state.enemies.map(e =>
          e.id === enemy.id ? applyEnemyDamage(e, incomingPatch.reflectDamageTo!.amount, 0) : e,
        );
      }
      if (this.checkOutcome()) return;
    }
  }

  private fireComboReaction(combo: ComboKind): void {
    this.state.combosTriggeredThisStage[combo] += 1;
    this.fireReactionTrigger('onCombo', { combo });
    // Combo Cascade — talent + Stronghold's "Combo Cascade" upgrade BOTH
    // refund stamina + draw a card per combo. Sources stack additively.
    const refund = this.state.talents.comboStaminaRefund + this.state.upgradeBuffs.comboStaminaRefund;
    if (refund > 0) {
      this.state.staminaThisTurn += refund;
      this.drawCards(1);
    }
  }

  private fireReactionTrigger(
    trigger:
      | 'onStageStart' | 'onTurnStart' | 'onAttackIncoming' | 'onAttackResolved'
      | 'onBlockApplied' | 'onCombo' | 'onCrit' | 'onKill' | 'onDamageDealt'
      | 'onLowHp' | 'onLethal' | 'onHeal',
    extras: { damage?: number; damageType?: DamageType; combo?: ComboKind; victimEnemyId?: string; source?: 'enemy' | 'player' | 'environment' } = {},
  ) {
    const r = fireReactions(this.state.reactions, {
      trigger,
      player: this.state.player,
      enemies: this.state.enemies,
      ...extras,
    });
    this.state.reactions = r.state;
    // Apply common patch fields immediately. Damage cancellation/reduction
    // is consumed by the caller (applyEnemyAttack handles its own).
    if (r.patch.healPlayer) this.state.player = healPlayer(this.state.player, r.patch.healPlayer);
    if (r.patch.giveBlock) this.state.player = addBlock(this.state.player, r.patch.giveBlock);
    if (r.patch.applyToPlayer) {
      this.state.player = applyPlayerStatus(
        this.state.player,
        r.patch.applyToPlayer.id as never,
        r.patch.applyToPlayer.stacks,
        r.patch.applyToPlayer.turns,
      );
    }
    return r.patch;
  }

  private checkOutcome(): boolean {
    if (!isAlive(this.state.player)) {
      this.state.outcome = 'defeated';
      return true;
    }
    if (this.state.enemies.every(e => !isEnemyAlive(e))) {
      this.state.outcome = 'cleared';
      return true;
    }
    return false;
  }
}

// === Talent compilation (Phase 6C) ===
//
// Reads each Perk's modifier and folds it into a flat object the runner can
// query in O(1) at hot paths. Stat-shaped modifiers (handSize, sigilSlots,
// etc.) are NOT folded here — the factory handles those via computePlayerStats.
// This compilation is for combat-runtime modifiers only.

function compileTalents(list: ReadonlyArray<Perk>): BattleState['talents'] {
  const out: BattleState['talents'] = {
    list,
    firstActionDamageBonus: 0,
    firstActionUsedThisTurn: false,
    typeBonuses: {},
    aegisThreshold: 0,
    aegisBlock: 0,
    aegisFired: false,
    critHeal: 0,
    allComboDamageMult: 1,
    cardReplicateChance: 0,
    cleanTurnHeal: 0,
    triadicBonusPct: 0,
    blockCarryCap: 0,
    comboStaminaRefund: 0,
    tacticEffectMult: 1,
    stageStartHeal: 0,
  };

  for (const t of list) {
    const m = t.modifier;
    switch (m.type) {
      case 'first_action_damage_bonus':
        out.firstActionDamageBonus = Math.max(out.firstActionDamageBonus, m.pct);
        break;
      case 'damage_type_bonus':
        out.typeBonuses[m.damageType] = (out.typeBonuses[m.damageType] ?? 0) + m.pct;
        break;
      case 'auto_block_low_hp':
        out.aegisThreshold = Math.max(out.aegisThreshold, m.threshold);
        out.aegisBlock = Math.max(out.aegisBlock, m.block);
        break;
      case 'crit_heal':
        out.critHeal = Math.max(out.critHeal, m.value);
        break;
      case 'crit_chance_bonus':
        // Stat-shaped — handled in factory. But Lucky Streak ALSO grants
        // crit_heal on crits. The factory routes the +crit% through stats;
        // we wire the heal-on-crit here.
        // (No-op in compileTalents; the heal value comes from the dedicated
        // crit_heal modifier added by the same talent — but Lucky Streak
        // only has crit_chance_bonus per current talents.json. The companion
        // crit_heal isn't separately listed; treat the talent presence as
        // implying +2 HP per crit per the GDD effect text.)
        if (t.id === 'talent.lucky_streak') {
          out.critHeal = Math.max(out.critHeal, 2);
        }
        break;
      case 'all_combo_damage_mult':
        out.allComboDamageMult = Math.max(out.allComboDamageMult, m.mult);
        break;
      case 'card_replicate_chance':
        out.cardReplicateChance = Math.max(out.cardReplicateChance, m.pct);
        break;
      case 'clean_turn_heal':
        out.cleanTurnHeal = Math.max(out.cleanTurnHeal, m.value);
        break;
      case 'triadic_damage_bonus':
        out.triadicBonusPct = Math.max(out.triadicBonusPct, m.pct);
        break;
      case 'block_carry_cap':
        out.blockCarryCap = Math.max(out.blockCarryCap, m.value);
        break;
      case 'combo_stamina_refund':
        out.comboStaminaRefund = Math.max(out.comboStaminaRefund, m.value);
        break;
      case 'tactic_effect_bonus':
        out.tacticEffectMult = Math.max(out.tacticEffectMult, 1 + m.pct);
        break;
      case 'max_hp_bonus':
        // Folded into stats via factory. Vigorous *also* heals at stage start
        // — that bit lives here.
        if (t.id === 'talent.vigorous') {
          out.stageStartHeal = Math.max(out.stageStartHeal, 5);
        }
        break;
      // The following talent modifier kinds are stat-shaped (handled by the
      // factory) or out-of-scope for runtime in v1. Listed exhaustively so a
      // future TS upgrade catches missing cases:
      case 'starting_coins':
      case 'round_one_extra_draw':
      case 'hand_size_delta':
      case 'plot_count_delta':
      case 'global_sale_mult':
      case 'onslaught_tier_bump':
      case 'relentless_cap_delta':
      case 'combo_cascade_draw':
      case 'triadic_threshold_delta':
      case 'first_seed_grow_delta':
      case 'tool_draw_bonus':
      case 'watering_can_free_uses':
      case 'forced_boon_count':
      case 'goal_harvest_crop':
      case 'goal_plant_crop':
      case 'stage_start_heal':
      case 'turn_one_extra_draw':
      case 'tactic_stamina_discount':
      case 'sigil_slots_delta':
      case 'gold_drop_bonus':
      case 'speed_bonus':
      case 'noop':
        break;
    }
  }

  return out;
}
