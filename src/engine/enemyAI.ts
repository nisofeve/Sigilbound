// Sigilbound enemy AI — picks the next telegraphed intent for an enemy
// each time the player ends a turn.
//
// Every archetype has a `BehaviorTable` (array of IntentWeight). chooseIntent()
// performs a deterministic weighted roll using a seeded RNG so client + cloud
// produce identical telegraphs from the same seed.
//
// The intent the AI returns is what the enemy will do on its NEXT turn.
// Telegraphing means: intent appears at end of player turn N, fires at the
// start of enemy turn N+1.
//
// GDD §Enemy System defines 7 archetypes. Each has a clear personality:
//   brute       — slow, big swings; mostly attack, occasional block
//   skirmisher  — multi-hit attacks; rarely blocks, often debuffs Bleed
//   caster      — ranged Pyre/Frost/Arcane; debuffs (Weakened, Marked)
//   tank        — high block; counter-attacks; pierces sometimes
//   summoner    — spawns minions every 2 turns; weak attack otherwise
//   elite       — hybrid: alternates attack / block / debuff with charge
//   boss        — hand-tuned via EnemyDef.customBehavior; falls back to elite

import type { Rng } from './rng';
import type {
  Archetype,
  EnemyDef,
  EnemyState,
  Intent,
  IntentWeight,
} from './enemy';

// === Behavior tables ===

const BRUTE: ReadonlyArray<IntentWeight> = [
  // 70% big single attack
  { weight: 7, build: (def) => ({ kind: 'attack', damage: Math.round(def.atk * 1.5), type: def.damageType }) },
  // 20% even bigger 2-turn charged attack
  { weight: 2, build: (def) => ({
      kind: 'charge',
      turnsLeft: 1,
      payload: { kind: 'attack', damage: Math.round(def.atk * 2.5), type: def.damageType },
    }) },
  // 10% block
  { weight: 1, build: (def) => ({ kind: 'block', amount: Math.max(4, Math.round(def.atk * 0.6)) }) },
];

const SKIRMISHER: ReadonlyArray<IntentWeight> = [
  // 60% multi-hit
  { weight: 6, build: (def) => ({ kind: 'attack', damage: Math.max(2, Math.round(def.atk * 0.4)), type: def.damageType, hits: 3 }) },
  // 25% single bleed-applying attack
  { weight: 2.5, build: (def) => ({ kind: 'attack', damage: def.atk, type: def.damageType }) },
  // 15% debuff (apply Bleed)
  { weight: 1.5, build: () => ({ kind: 'debuff', status: 'bleed', stacks: 2, turns: 2 }) },
];

const CASTER: ReadonlyArray<IntentWeight> = [
  // 50% ranged attack matching the caster's element
  { weight: 5, build: (def) => ({ kind: 'attack', damage: def.atk, type: def.damageType }) },
  // 25% debuff (Weakened or Marked, picked by archetype mood — pick deterministically by atk parity)
  { weight: 2.5, build: (def) => ({
      kind: 'debuff',
      status: def.atk % 2 === 0 ? 'weakened' : 'marked',
      stacks: 1,
      turns: 2,
    }) },
  // 25% multi-turn channel for a big spell
  { weight: 2.5, build: (def) => ({
      kind: 'charge',
      turnsLeft: 1,
      payload: { kind: 'attack', damage: Math.round(def.atk * 2), type: def.damageType, piercing: 0.5 },
    }) },
];

const TANK: ReadonlyArray<IntentWeight> = [
  // 50% gain a chunk of block
  { weight: 5, build: (def) => ({ kind: 'block', amount: Math.max(8, def.atk) }) },
  // 35% piercing counter-attack
  { weight: 3.5, build: (def) => ({ kind: 'attack', damage: Math.max(4, Math.round(def.atk * 0.8)), type: def.damageType, piercing: 0.3 }) },
  // 15% Vulnerable on player (set up bigger next hit)
  { weight: 1.5, build: () => ({ kind: 'debuff', status: 'vulnerable', stacks: 1, turns: 2 }) },
];

const SUMMONER: ReadonlyArray<IntentWeight> = [
  // Summon every 2nd turn (forced via state-aware rule below in chooseIntent).
  // Default loadout assumes "no forced summon this turn":
  { weight: 5, build: (def) => ({ kind: 'attack', damage: def.atk, type: def.damageType }) },
  { weight: 3, build: () => ({ kind: 'debuff', status: 'curse', stacks: 1, turns: 3 }) },
  { weight: 2, build: (def) => ({ kind: 'block', amount: Math.max(4, Math.round(def.atk * 0.5)) }) },
];

const ELITE: ReadonlyArray<IntentWeight> = [
  // Elites cycle through their toolkit. Equal-ish weights, slightly favour attack.
  { weight: 4, build: (def) => ({ kind: 'attack', damage: Math.round(def.atk * 1.3), type: def.damageType }) },
  { weight: 3, build: (def) => ({ kind: 'block', amount: Math.max(8, def.atk) }) },
  { weight: 2, build: () => ({ kind: 'debuff', status: 'vulnerable', stacks: 1, turns: 2 }) },
  { weight: 1, build: (def) => ({
      kind: 'charge',
      turnsLeft: 1,
      payload: { kind: 'attack', damage: Math.round(def.atk * 2.2), type: def.damageType },
    }) },
];

const BOSS: ReadonlyArray<IntentWeight> = ELITE; // fallback; data files override per-boss

const BEHAVIOR: Record<Archetype, ReadonlyArray<IntentWeight>> = {
  brute: BRUTE,
  skirmisher: SKIRMISHER,
  caster: CASTER,
  tank: TANK,
  summoner: SUMMONER,
  elite: ELITE,
  boss: BOSS,
};

// === Public API ===

// Pick the next telegraphed intent for `enemy`. Deterministic given the same
// rng state. Caller should pass an rng that's been seeded for the (run, turn,
// enemy) tuple if they need reproducibility, or share a single rng across
// all enemies if they want only run-level determinism.
export function chooseIntent(def: EnemyDef, enemy: EnemyState, rng: Rng): Intent {
  // Summoner has a forced summon every 2nd turn (turnsTaken even & nonzero).
  if (def.archetype === 'summoner' && enemy.turnsTaken > 0 && enemy.turnsTaken % 2 === 0) {
    // Forced summon — spawn a same-difficulty skirmisher minion.
    return { kind: 'summon', archetype: 'skirmisher' };
  }

  // Custom behaviour from the data file (boss overrides).
  const table = def.customBehavior ?? BEHAVIOR[def.archetype];
  if (!table || table.length === 0) {
    // Defensive fallback so we never crash on a misconfigured enemy.
    return { kind: 'attack', damage: def.atk, type: def.damageType };
  }

  return rollWeighted(table, def, enemy, rng);
}

// Advance a multi-turn charge intent. Called by the runner at start of enemy
// turn BEFORE executing the intent. Returns either:
//   - the unmodified charge with turnsLeft decremented, OR
//   - the payload intent (when the charge resolves this turn)
export function advanceCharge(intent: Intent): Intent {
  if (intent.kind !== 'charge') return intent;
  if (intent.turnsLeft <= 0) return intent.payload;
  return { kind: 'charge', turnsLeft: intent.turnsLeft - 1, payload: intent.payload };
}

// === Internal ===

function rollWeighted(
  table: ReadonlyArray<IntentWeight>,
  def: EnemyDef,
  enemy: EnemyState,
  rng: Rng,
): Intent {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  if (total <= 0) return { kind: 'attack', damage: def.atk, type: def.damageType };
  let r = rng.next() * total;
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) return entry.build(def, enemy);
  }
  // Floating-point fallback — return the last entry.
  return table[table.length - 1].build(def, enemy);
}
