// Sigilbound enemy data + runtime state.
//
// Two layers:
//   - EnemyDef: static template (HP, atk, archetype, sprite). Loaded from
//     data/enemies.json in Phase 4.
//   - EnemyState: runtime instance for a battle (current HP, status bag,
//     pending intent, intent queue).
//
// Intent telegraphs are the GDD's solution to "no surprise attacks":
// every enemy publishes its NEXT action at the end of the current turn,
// so the player can plan around it. The AI handler in enemyAI.ts decides
// what intent to roll given current state + seeded RNG.

import type { DamageType, Resistances } from './damage';
import type { StatusBag, StatusId } from './status';

// Seven archetypes per GDD §Enemy System. Each has a different intent
// distribution (brute = mostly attack, tank = mostly block + retaliate, etc.)
export type Archetype = 'brute' | 'skirmisher' | 'caster' | 'tank' | 'summoner' | 'elite' | 'boss';

// Difficulty band sets HP + damage. Stage tier picks the band.
export type Difficulty = 'easy' | 'medium' | 'hard';

// What the enemy is about to do. The runner reads this at the start of the
// enemy turn and executes it.
export type Intent =
  | { kind: 'attack'; damage: number; type: DamageType; hits?: number; piercing?: number }
  | { kind: 'block'; amount: number }
  | { kind: 'summon'; archetype: Archetype }
  | { kind: 'debuff'; status: StatusId; stacks: number; turns: number }
  | { kind: 'charge'; turnsLeft: number; payload: Intent }   // multi-turn telegraph
  | { kind: 'hidden' };                                       // mythic only

// Static template — what a "Frost Drake" or "Goblin Slasher" actually is.
// The data file in Phase 4 will produce arrays of these.
export interface EnemyDef {
  id: string;                  // e.g., 'frost_drake'
  name: string;                // 'Frost Drake'
  archetype: Archetype;
  difficulty: Difficulty;
  sprite: string;              // emoji placeholder; later swapped for asset
  baseHp: number;
  atk: number;
  def: number;
  speed: number;               // affects intent ordering vs player
  damageType: DamageType;
  biome?: string;
  resistances?: Resistances;
  // Optional override of the archetype's default behaviour table — lets us
  // give a single boss a hand-tuned move set without spawning a new archetype.
  // Phase 4 will populate this for stage-100 The Sigilbreaker.
  customBehavior?: ReadonlyArray<IntentWeight>;
}

// Used by enemyAI to pick the next intent: each entry has a weight + a
// factory that produces the actual intent given the enemy's stats.
export interface IntentWeight {
  weight: number;
  build: (def: EnemyDef, state: EnemyState) => Intent;
}

// Live combatant state during a battle.
export interface EnemyState {
  id: string;                  // unique per battle (e.g., 'goblin_slasher_1')
  defId: string;               // foreign key into EnemyDef
  archetype: Archetype;
  damageType: DamageType;
  resistances: Resistances;
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  speed: number;
  block: number;
  statuses: StatusBag;
  // Currently telegraphed intent (what the enemy will do on its next turn).
  intent: Intent;
  // Queue for multi-turn charge attacks. When `intent.kind === 'charge'`,
  // the runner decrements turnsLeft each turn end; on hit-zero the payload
  // becomes the actual intent.
  // Sequencer tracker — counts how many enemy turns this entity has taken
  // this stage. Some archetypes change behaviour on certain turns
  // (e.g., summoner spawns minion every 2nd turn).
  turnsTaken: number;
}

export function newEnemyState(def: EnemyDef, instanceId: string): EnemyState {
  return {
    id: instanceId,
    defId: def.id,
    archetype: def.archetype,
    damageType: def.damageType,
    resistances: def.resistances ?? {},
    maxHp: def.baseHp,
    currentHp: def.baseHp,
    atk: def.atk,
    def: def.def,
    speed: def.speed,
    block: 0,
    statuses: {},
    // Spawn with a placeholder intent; the runner immediately calls
    // chooseIntent() to populate the first real telegraph.
    intent: { kind: 'block', amount: 0 },
    turnsTaken: 0,
  };
}

export function isEnemyAlive(e: EnemyState): boolean {
  return e.currentHp > 0;
}

// Reduce HP. Mirrors player.takePlayerDamage but simpler since enemies don't
// crit (yet) and use their own resistance table.
export function applyEnemyDamage(e: EnemyState, damage: number, blockConsumed: number): EnemyState {
  return {
    ...e,
    currentHp: Math.max(0, e.currentHp - damage),
    block: Math.max(0, e.block - blockConsumed),
  };
}

export function addEnemyBlock(e: EnemyState, amount: number): EnemyState {
  if (amount <= 0) return e;
  return { ...e, block: e.block + amount };
}

export function setEnemyIntent(e: EnemyState, intent: Intent): EnemyState {
  return { ...e, intent };
}
