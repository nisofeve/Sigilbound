// Sigilbound card defs — the data shape for Action / Tactic / Reaction cards
// loaded from src/data/*.json.
//
// These are distinct from Plotbound's SeedCard / ToolCard / EventCard types
// (which still live in types.ts) so the parallel engines don't entangle.
// When Phase 5 swaps the UI over, the old card types can be removed.
//
// All three loaders return frozen typed arrays. Tests load from the same
// data the runtime does, which keeps the engine + JSON in lockstep.

import type { Rarity } from './types';
import type { DamageType } from './damage';
import type { StatusId } from './status';
import type { ReactionTrigger } from './reactions';

// === ACTION cards (placed into Sigil Slots, charge, then resolve) ===
//
// `damage` is the raw payload. `charge` is the number of turns it sits in
// the slot before resolving (0 = resolves the same turn it's bound; mirrors
// the GDD's "⏱ N turns" badge). `cost` is stamina to play (Phase 5 wires the
// stamina pipeline).

export interface ActionCardDef {
  id: string;
  type: 'action';
  name: string;
  rarity: Rarity;
  damageType: DamageType;
  damage: number;
  charge: number;
  cost: number;                 // stamina cost (Phase 5)
  hits?: number;                // multi-strike (Blade Dance, Volley)
  // Free-form effect text. The runner handles a small set of effect
  // patterns; the rest is documentation for the UI.
  effect?: string;
  emoji: string;
  blockPiercing?: number;       // 0..1 — bypass that fraction of enemy block
  // On-hit status to apply to the target.
  applyStatus?: { id: StatusId; stacks: number; turns: number };
}

// === TACTIC cards (instant effects, played from hand) ===
//
// Tactics resolve immediately on play and go to discard. Some persistent
// tactics (Aether Conduit) stay on board — those are flagged via `persistent`.

export type TacticEffect =
  | { kind: 'block'; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'draw'; cards: number }
  | { kind: 'gain_stamina'; amount: number }
  | { kind: 'damage_buff'; pct: number; turns: number }
  | { kind: 'enemy_damage_debuff'; pct: number; turns: number }
  | { kind: 'apply_status_self'; id: StatusId; stacks: number; turns: number }
  | { kind: 'apply_status_all_enemies'; id: StatusId; stacks: number; turns: number }
  | { kind: 'sigil_advance'; amount: number; targetSigil?: number }   // Quickdraw / Aether Conduit
  | { kind: 'sigil_clear_redraw' }                                    // Sigil Refresh
  | { kind: 'extra_sigil_temp'; turns: number }                       // Sigil Vault
  | { kind: 'duplicate_top_discard_action' }                          // Echo Scroll
  | { kind: 'instant_resolve_one_sigil' }                             // Catalyst Vial
  | { kind: 'reveal_intents_all' }                                    // Foresight
  | { kind: 'tutor_pick_one' }                                        // Tactical Prep
  | { kind: 'extra_turn' }                                            // Time Warp
  | { kind: 'reflect_next_attack'; pct: number }                      // Damage Mirror
  | { kind: 'all_cards_buffed_zero_cost'; pct: number };              // Astral Pact

export interface TacticCardDef {
  id: string;
  type: 'tactic';
  name: string;
  rarity: Rarity;
  cost: number;
  persistent?: boolean;         // stays in play across turns until consumed
  effect: TacticEffect;
  // Free-form UI description. Authoritative human-readable copy.
  description: string;
  emoji: string;
}

// === REACTION cards (auto-trigger on events) ===
//
// These are NOT in the player's draw deck — they live in a separate reaction
// deck that the storage layer manages. Each card maps to an entry in
// REACTION_LIBRARY (engine/reactions.ts). The data file here is purely the
// catalogable list — UI grids, achievements ("Collect all reactions"), shop
// listings.

export interface ReactionCardDef {
  id: string;                   // matches REACTION_LIBRARY key
  type: 'reaction';
  name: string;
  rarity: Rarity;
  trigger: ReactionTrigger;
  description: string;
  emoji: string;
}

// === Loaders ===
//
// The data files are imported synchronously (Vite handles JSON imports).
// Loaders return cached frozen arrays — no per-call allocation.

import actionsData from '../data/actions.json';
import tacticsData from '../data/tactics.json';
import reactionsData from '../data/reactions.json';

const ACTIONS: ReadonlyArray<ActionCardDef> = Object.freeze(
  (actionsData as ActionCardDef[]).map(c => Object.freeze(c)),
);
const TACTICS: ReadonlyArray<TacticCardDef> = Object.freeze(
  (tacticsData as TacticCardDef[]).map(c => Object.freeze(c)),
);
const REACTIONS: ReadonlyArray<ReactionCardDef> = Object.freeze(
  (reactionsData as ReactionCardDef[]).map(c => Object.freeze(c)),
);

const ACTION_BY_ID = new Map(ACTIONS.map(c => [c.id, c]));
const TACTIC_BY_ID = new Map(TACTICS.map(c => [c.id, c]));
const REACTION_BY_ID = new Map(REACTIONS.map(c => [c.id, c]));

export function allActions(): ReadonlyArray<ActionCardDef> { return ACTIONS; }
export function allTactics(): ReadonlyArray<TacticCardDef> { return TACTICS; }
export function allReactionCards(): ReadonlyArray<ReactionCardDef> { return REACTIONS; }

export function getAction(id: string): ActionCardDef | undefined {
  return ACTION_BY_ID.get(id);
}
export function getTactic(id: string): TacticCardDef | undefined {
  return TACTIC_BY_ID.get(id);
}
export function getReactionCard(id: string): ReactionCardDef | undefined {
  return REACTION_BY_ID.get(id);
}

// Convenience: hand the runner an ActionInstance from a card def + override.
import type { ActionInstance } from './battle';

export function actionInstanceFor(def: ActionCardDef, targetEnemyId?: string): ActionInstance {
  return {
    cardId: def.id,
    damage: def.damage,
    damageType: def.damageType,
    charge: def.charge,
    hits: def.hits,
    blockPiercing: def.blockPiercing,
    targetEnemyId,
  };
}
