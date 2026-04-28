// Sigilbound player character.
//
// Two distinct concerns live here:
//
//   1. PlayerStats — pure data describing the player's stat block. Computed
//      from base level + equipment + talents + temp run buffs. Cloud can
//      replay this since it's a pure fn.
//
//   2. PlayerCombatant — runtime state for a single battle: current HP,
//      current Block, status bag, accumulated counters (stamina spent,
//      damage taken this turn, etc.). Mutated by the battle runner.
//
// HP rules (GDD §Character):
//   - Default mode: each stage starts at full HP. No carry-over.
//   - Hardcore mode: HP carries across the 5-stage arc. Phase 6 toggle.
// This module exposes the rules; the runner picks which to apply.

import type { DamageType, Resistances } from './damage';
import { computeDamage, type DamageInput, type DamageOutput } from './damage';
import {
  applyStatus,
  decayStatuses,
  incomingDamageMult,
  outgoingDamageMult,
  tickDamageOverTime,
  tickHealOverTime,
  type StatusBag,
  type StatusId,
} from './status';

export interface PlayerStats {
  maxHp: number;
  atk: number;
  def: number;
  critChance: number;          // 0..1
  speed: number;               // multiplier (1.0 = normal)
  stamina: number;             // max stamina per turn
  // Resistance modifier from gear/talents (resistances at the player level —
  // e.g., Drakehide Plate gives 50% Pyre resist).
  resistances: Resistances;
  // Sigil slot count (3..6). Stored on stats so equipment/talents that grant
  // +1 slot can be folded in cleanly.
  sigilSlots: number;
  handSize: number;
}

// Base stats per level. Derived from the GDD §Character "Player Leveling" table.
// Linear interpolation between the breakpoints there: 1→50/0, 50→250/30.
// HP = 50 + (level-1) * 4, Atk grows ~0.6/level. Crit is purely from gear.
const HP_PER_LEVEL = 4;
const ATK_PER_LEVEL = 0.6;
const MAX_LEVEL = 50;
const BASE_HP = 50;
const BASE_ATK = 0;
const BASE_DEF = 0;
const BASE_CRIT = 0.05;
const BASE_SPEED = 1.0;
const BASE_STAMINA = 3;
const BASE_SIGIL_SLOTS = 3;
const BASE_HAND_SIZE = 5;

export function baseStatsForLevel(level: number): PlayerStats {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  const lvDelta = lv - 1;
  return {
    maxHp: BASE_HP + lvDelta * HP_PER_LEVEL,
    atk: Math.floor(BASE_ATK + lvDelta * ATK_PER_LEVEL),
    def: BASE_DEF,
    critChance: BASE_CRIT,
    speed: BASE_SPEED,
    stamina: BASE_STAMINA,
    resistances: {},
    sigilSlots: BASE_SIGIL_SLOTS,
    handSize: BASE_HAND_SIZE,
  };
}

// Equipment / talent stat contributions, summed flat into the stat block.
// Equipment.json + Talent.json modifiers compile down to one of these per
// equipped piece/talent; computePlayerStats sums them all.
export interface StatModifier {
  maxHp?: number;
  atk?: number;
  def?: number;
  critChance?: number;
  speed?: number;
  stamina?: number;
  sigilSlots?: number;
  handSize?: number;
  resistances?: Resistances;
}

export interface ComputeStatsInput {
  level: number;
  modifiers: ReadonlyArray<StatModifier>;
}

// Sum the player's stats from level baseline + a flat list of equipment +
// talent modifiers. Pure — same input always returns same output (good for
// cloud replay + memoization).
export function computePlayerStats(input: ComputeStatsInput): PlayerStats {
  const out = baseStatsForLevel(input.level);
  for (const m of input.modifiers) {
    if (m.maxHp) out.maxHp += m.maxHp;
    if (m.atk) out.atk += m.atk;
    if (m.def) out.def += m.def;
    if (m.critChance) out.critChance += m.critChance;
    if (m.speed) out.speed += m.speed;
    if (m.stamina) out.stamina += m.stamina;
    if (m.sigilSlots) out.sigilSlots += m.sigilSlots;
    if (m.handSize) out.handSize += m.handSize;
    if (m.resistances) {
      for (const [type, value] of Object.entries(m.resistances) as Array<[DamageType, number]>) {
        // Resistances multiply: 0.5 + 0.5 from two pieces is NOT 1.0; it's
        // 0.5 * 0.5 = 0.25 (compound). This matches the GDD's "+50% resist"
        // language reading multiplicatively.
        out.resistances[type] = (out.resistances[type] ?? 1) * value;
      }
    }
  }
  // Clamp safety values so absurd modifiers don't break invariants.
  out.critChance = clamp01(out.critChance);
  out.maxHp = Math.max(1, out.maxHp);
  out.sigilSlots = Math.max(1, Math.min(6, out.sigilSlots));
  out.handSize = Math.max(1, out.handSize);
  out.stamina = Math.max(0, out.stamina);
  return out;
}

// === Runtime combatant ===

export interface PlayerCombatant {
  stats: PlayerStats;
  currentHp: number;
  block: number;                // resets at end of turn (runner's job)
  statuses: StatusBag;
  // Per-stage counters used by 3★ objectives.
  damageTakenThisStage: number;
  damageDealtThisStage: number;
  damageDealtByType: Partial<Record<DamageType, number>>;
  consecutiveCleanTurns: number; // turns in a row with no HP loss
  enemiesDefeated: number;
}

export function newCombatant(stats: PlayerStats): PlayerCombatant {
  return {
    stats,
    currentHp: stats.maxHp,
    block: 0,
    statuses: {},
    damageTakenThisStage: 0,
    damageDealtThisStage: 0,
    damageDealtByType: {},
    consecutiveCleanTurns: 0,
    enemiesDefeated: 0,
  };
}

// Apply incoming damage to the combatant. Routes through computeDamage with
// the player's current block + def + statuses. Returns the new combatant
// and the damage breakdown.
export function takePlayerDamage(
  c: PlayerCombatant,
  attack: { raw: number; type: DamageType; attackerAtk?: number; blockPiercing?: number },
  critRoll: number = 1, // enemies don't normally crit; pass 1 to disable
): { combatant: PlayerCombatant; result: DamageOutput } {
  const { mult, bag: bagAfterMarked } = incomingDamageMult(c.statuses, { consumeMarked: true });
  const input: DamageInput = {
    raw: Math.round(attack.raw * mult),
    type: attack.type,
    attackerAtk: attack.attackerAtk ?? 0,
    attackerCritChance: 0,
    defenderDef: c.stats.def,
    defenderBlock: c.block,
    defenderResistances: c.stats.resistances,
    critRoll,
    blockPiercing: attack.blockPiercing,
  };
  const result = computeDamage(input);
  const next: PlayerCombatant = {
    ...c,
    statuses: bagAfterMarked,
    currentHp: Math.max(0, c.currentHp - result.hpDelta),
    block: Math.max(0, c.block - result.blockConsumed),
    damageTakenThisStage: c.damageTakenThisStage + result.hpDelta,
    consecutiveCleanTurns: result.hpDelta > 0 ? 0 : c.consecutiveCleanTurns,
  };
  return { combatant: next, result };
}

// Heal the combatant. Cap at maxHp.
export function healPlayer(c: PlayerCombatant, amount: number): PlayerCombatant {
  if (amount <= 0) return c;
  return { ...c, currentHp: Math.min(c.stats.maxHp, c.currentHp + amount) };
}

// Add block (from Brace/Bulwark/talents). Block stacks within a turn.
export function addBlock(c: PlayerCombatant, amount: number): PlayerCombatant {
  if (amount <= 0) return c;
  return { ...c, block: c.block + amount };
}

// Reset block to 0. Runner calls this at end of player turn (default rule)
// or skips it when Iron Discipline talent carries block over (capped at 20).
export function clearBlock(c: PlayerCombatant): PlayerCombatant {
  if (c.block === 0) return c;
  return { ...c, block: 0 };
}

// Apply a status effect to the player.
export function applyPlayerStatus(
  c: PlayerCombatant,
  id: StatusId,
  stacks: number,
  turns: number,
): PlayerCombatant {
  return { ...c, statuses: applyStatus(c.statuses, id, stacks, turns) };
}

// End-of-turn tick: apply DoT damage, regen, then decay turn counters.
// Returns the new combatant state plus total damage/heal applied (for UI).
export function tickEndOfPlayerTurn(c: PlayerCombatant): {
  combatant: PlayerCombatant;
  dotDamage: number;
  regenHeal: number;
  cleanTurn: boolean;
} {
  const dotResult = tickDamageOverTime(c.statuses);
  const healResult = tickHealOverTime(dotResult.bag);

  let hp = c.currentHp;
  let damageTaken = c.damageTakenThisStage;

  if (dotResult.damage > 0) {
    const taken = Math.min(hp, dotResult.damage);
    hp -= taken;
    damageTaken += taken;
  }
  if (healResult.heal > 0) {
    hp = Math.min(c.stats.maxHp, hp + healResult.heal);
  }

  const cleanTurn = dotResult.damage === 0 && c.consecutiveCleanTurns >= 0; // see below
  const decayed = decayStatuses(healResult.bag);

  const next: PlayerCombatant = {
    ...c,
    currentHp: Math.max(0, hp),
    statuses: decayed,
    damageTakenThisStage: damageTaken,
    // Caller increments consecutiveCleanTurns AFTER seeing whether enemy
    // attacks landed this turn; here we just don't reset it for DoT-only
    // damage. (Strict reading of "no damage taken" includes DoTs — let the
    // runner make the policy call.)
  };
  return {
    combatant: next,
    dotDamage: dotResult.damage,
    regenHeal: healResult.heal,
    cleanTurn,
  };
}

// Outgoing damage multiplier — Weakened halves output. The damage pipeline
// reads this BEFORE running computeDamage so combos still see the buffed
// raw value.
export function playerOutgoingMult(c: PlayerCombatant): number {
  return outgoingDamageMult(c.statuses);
}

export function isAlive(c: PlayerCombatant): boolean {
  return c.currentHp > 0;
}

// === Internal helpers ===

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
