// Sigilbound reaction system — auto-triggered effects that fire on specific
// battle events. Reactions live in a separate "reaction deck" (NOT the
// player's normal deck), draw fresh per stage, and consume themselves on
// trigger unless flagged persistent.
//
// Architecture: an event-driven dispatcher. Battle runner emits an event
// (onAttack, onKill, onCombo, …); the dispatcher walks the active reaction
// list and runs each one whose `trigger` matches. Reactions return a patch
// that the runner applies to combat state (player HP, block, draw bonuses,
// damage modifiers).
//
// This module is pure — no I/O, no rng. The runner threads any rng + state
// through ReactionContext so handlers stay testable.

import type { DamageType } from './damage';
import type { StatusBag } from './status';
import type { PlayerCombatant } from './player';
import type { EnemyState } from './enemy';

export type ReactionTrigger =
  | 'onStageStart'
  | 'onTurnStart'
  | 'onAttackIncoming'    // before incoming damage applies
  | 'onAttackResolved'    // after incoming damage applies
  | 'onBlockApplied'
  | 'onCombo'             // any combo (the runner passes which one)
  | 'onCrit'
  | 'onKill'              // player kills any enemy
  | 'onDamageDealt'       // every dmg event the player produces
  | 'onLowHp'             // HP <= 25%
  | 'onLethal'            // damage that WOULD bring HP to 0
  | 'onHeal';

export type ComboKind = 'onslaught' | 'triadic' | 'relentless';

// Context passed to every reaction handler. Read-only snapshot of state +
// trigger-specific payload. Handlers return a `ReactionPatch` describing
// what to change.
export interface ReactionContext {
  trigger: ReactionTrigger;
  player: PlayerCombatant;
  enemies: ReadonlyArray<EnemyState>;
  // Trigger-specific data:
  combo?: ComboKind;
  damage?: number;
  damageType?: DamageType;
  victimEnemyId?: string;
  // Where the trigger came from. Useful for logging.
  source?: 'enemy' | 'player' | 'environment';
}

// What a reaction can mutate. Runner applies these in order.
export interface ReactionPatch {
  // Damage modifiers (apply BEFORE the runner finalises the hit).
  cancelIncomingDamage?: boolean;        // Parry full negate (up to N)
  reduceIncomingDamageBy?: number;       // Parry partial
  reduceIncomingDamagePct?: number;      // Dodge (0..1)
  reflectDamageTo?: { enemyId?: string; amount: number }; // Counterstrike
  // Player resource changes
  healPlayer?: number;
  giveBlock?: number;
  giveStamina?: number;
  drawCards?: number;
  // Damage buffs
  damageBuffPct?: number;                // Last Stand (+50% while low HP)
  // Survival
  surviveAtHp?: number;                  // Phoenix Heart (set HP to N instead of dying)
  // Sigil echo: re-trigger one resolved sigil
  echoSigil?: boolean;
  // Status changes
  applyToPlayer?: { id: keyof StatusBag; stacks: number; turns: number };
  // Optional textual log for UI ("Parry! Negated 6 dmg.")
  log?: string;
}

export interface ReactionDef {
  id: string;
  name: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  trigger: ReactionTrigger;
  // Gate fires only when this returns true. e.g., Last Stand needs HP < 25%.
  predicate?: (ctx: ReactionContext) => boolean;
  apply: (ctx: ReactionContext) => ReactionPatch;
  // Reactions are by default consumed on fire; persistent ones (Last Stand,
  // Phoenix Heart) stay until the stage ends.
  persistent?: boolean;
  // Lower priority fires earlier. e.g., Parry (negate) should run before
  // Counterstrike (reflect) so the right damage value is reflected.
  priority?: number;
}

// === Built-in reactions per GDD §Reaction Cards (10 cards) ===

export const REACTION_LIBRARY: Record<string, ReactionDef> = {
  parry: {
    id: 'parry',
    name: 'Parry',
    rarity: 'common',
    trigger: 'onAttackIncoming',
    priority: 0,
    apply: (ctx) => {
      const dmg = ctx.damage ?? 0;
      const negated = Math.min(6, dmg);
      return { reduceIncomingDamageBy: negated, log: `Parry! Negated ${negated} dmg.` };
    },
  },
  dodge: {
    id: 'dodge',
    name: 'Dodge',
    rarity: 'common',
    trigger: 'onAttackIncoming',
    priority: 1,
    apply: () => ({ reduceIncomingDamagePct: 0.5, log: 'Dodge! Avoided half damage.' }),
  },
  counterstrike: {
    id: 'counterstrike',
    name: 'Counterstrike',
    rarity: 'uncommon',
    trigger: 'onBlockApplied',
    priority: 5,
    apply: () => ({ reflectDamageTo: { amount: 4 }, log: 'Counterstrike! Reflected 4 dmg.' }),
  },
  bloodthirst: {
    id: 'bloodthirst',
    name: 'Bloodthirst',
    rarity: 'uncommon',
    trigger: 'onKill',
    apply: () => ({ healPlayer: 3, log: 'Bloodthirst! +3 HP.' }),
  },
  power_surge: {
    id: 'power_surge',
    name: 'Power Surge',
    rarity: 'rare',
    trigger: 'onCombo',
    apply: () => ({ giveStamina: 1, log: 'Power Surge! +1 stamina.' }),
  },
  sigil_echo: {
    id: 'sigil_echo',
    name: 'Sigil Echo',
    rarity: 'rare',
    trigger: 'onCombo',
    apply: () => ({ echoSigil: true, log: 'Sigil Echo! Repeat one slot.' }),
  },
  last_stand: {
    id: 'last_stand',
    name: 'Last Stand',
    rarity: 'epic',
    trigger: 'onLowHp',
    persistent: true,
    predicate: (ctx) => ctx.player.currentHp / Math.max(1, ctx.player.stats.maxHp) < 0.25,
    apply: () => ({ damageBuffPct: 0.5, log: 'Last Stand! +50% damage.' }),
  },
  phoenix_heart: {
    id: 'phoenix_heart',
    name: 'Phoenix Heart',
    rarity: 'epic',
    trigger: 'onLethal',
    persistent: false, // single-use per stage
    apply: () => ({ surviveAtHp: 1, log: 'Phoenix Heart! Survived at 1 HP.' }),
  },
  soulbond: {
    id: 'soulbond',
    name: 'Soulbond',
    rarity: 'rare',
    trigger: 'onHeal',
    apply: (ctx) => ({ damageBuffPct: (ctx.damage ?? 0) > 0 ? 0.25 : 0, log: 'Soulbond charged.' }),
  },
  sigilbinders_will: {
    id: 'sigilbinders_will',
    name: "Sigilbinder's Will",
    rarity: 'legendary',
    trigger: 'onStageStart',
    apply: () => ({ drawCards: 1, giveBlock: 4, log: "Sigilbinder's Will: bound 1 free Action." }),
  },
};

// === Dispatcher ===

export interface ActiveReactions {
  // Reactions currently in play (drawn from the reaction deck for this stage).
  // Identity of `id` matches REACTION_LIBRARY keys.
  active: ReadonlyArray<string>;
  // Reactions consumed this stage, kept so we can render them dimmed in UI
  // and so persistent ones don't fire twice if they're configured single-use.
  consumed: ReadonlyArray<string>;
}

export function emptyReactions(): ActiveReactions {
  return { active: [], consumed: [] };
}

// Walk all active reactions, fire those that match the trigger + predicate,
// merge their patches in priority order, and return the merged patch + the
// updated reaction list (with one-shot reactions removed).
export function fireReactions(
  state: ActiveReactions,
  ctx: ReactionContext,
): { patch: ReactionPatch; state: ActiveReactions; firedIds: string[] } {
  const eligible: ReactionDef[] = [];
  for (const id of state.active) {
    const def = REACTION_LIBRARY[id];
    if (!def) continue;
    if (def.trigger !== ctx.trigger) continue;
    if (def.predicate && !def.predicate(ctx)) continue;
    eligible.push(def);
  }
  // Sort by priority ascending (lower fires earlier), stable-equivalent by
  // insertion order via index.
  eligible.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const merged: ReactionPatch = {};
  const firedIds: string[] = [];
  for (const def of eligible) {
    const p = def.apply(ctx);
    mergePatch(merged, p);
    firedIds.push(def.id);
  }

  // Remove non-persistent reactions that fired.
  const consumedNow = new Set<string>(
    eligible.filter(d => !d.persistent).map(d => d.id),
  );
  const nextActive = state.active.filter(id => !consumedNow.has(id));
  const nextConsumed = consumedNow.size === 0
    ? state.consumed
    : [...state.consumed, ...consumedNow];

  return {
    patch: merged,
    state: { active: nextActive, consumed: nextConsumed },
    firedIds,
  };
}

// === Internal ===

function mergePatch(dst: ReactionPatch, src: ReactionPatch): void {
  if (src.cancelIncomingDamage) dst.cancelIncomingDamage = true;
  if (src.reduceIncomingDamageBy) {
    dst.reduceIncomingDamageBy = (dst.reduceIncomingDamageBy ?? 0) + src.reduceIncomingDamageBy;
  }
  if (src.reduceIncomingDamagePct) {
    // Multiplicative stack: 0.5 + 0.5 → 0.25 remaining (75% reduction).
    dst.reduceIncomingDamagePct =
      1 - (1 - (dst.reduceIncomingDamagePct ?? 0)) * (1 - src.reduceIncomingDamagePct);
  }
  if (src.reflectDamageTo) {
    if (dst.reflectDamageTo) {
      dst.reflectDamageTo = { ...dst.reflectDamageTo, amount: dst.reflectDamageTo.amount + src.reflectDamageTo.amount };
    } else {
      dst.reflectDamageTo = { ...src.reflectDamageTo };
    }
  }
  if (src.healPlayer) dst.healPlayer = (dst.healPlayer ?? 0) + src.healPlayer;
  if (src.giveBlock) dst.giveBlock = (dst.giveBlock ?? 0) + src.giveBlock;
  if (src.giveStamina) dst.giveStamina = (dst.giveStamina ?? 0) + src.giveStamina;
  if (src.drawCards) dst.drawCards = (dst.drawCards ?? 0) + src.drawCards;
  if (src.damageBuffPct) dst.damageBuffPct = (dst.damageBuffPct ?? 0) + src.damageBuffPct;
  if (src.surviveAtHp) dst.surviveAtHp = src.surviveAtHp; // Last writer wins
  if (src.echoSigil) dst.echoSigil = true;
  if (src.applyToPlayer) dst.applyToPlayer = src.applyToPlayer;
  if (src.log) dst.log = (dst.log ? `${dst.log} ${src.log}` : src.log);
}
