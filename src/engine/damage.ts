// Sigilbound damage resolution. Pure functions — no I/O, no state mutation.
// Combo bonuses are applied by the caller BEFORE this runs (the combo
// resolver multiplies the raw `damage` field on the action; this module then
// applies attacker buffs, defender block/def, resistances, and crits).
//
// GDD §Damage Types — 5 types: Steel, Pierce, Pyre, Frost, Arcane. Each
// damage instance has exactly one type. Resistances are stored as a multiplier
// on the defender (e.g., `pyre: 0.5` = takes half Pyre damage; `pyre: 2.0`
// = takes double; default 1.0 = neutral).

export type DamageType = 'steel' | 'pierce' | 'pyre' | 'frost' | 'arcane';

export const DAMAGE_TYPES: ReadonlyArray<DamageType> = ['steel', 'pierce', 'pyre', 'frost', 'arcane'];

// Per-type multipliers on the defender. 1.0 = neutral, <1 = resistant,
// >1 = vulnerable. Missing entry defaults to 1.0.
export type Resistances = Partial<Record<DamageType, number>>;

export interface DamageInput {
  raw: number;                  // Base damage of the action (post-combo, post-attacker-buffs).
  type: DamageType;
  attackerAtk: number;          // Flat additive from Atk stat. Min 0.
  attackerCritChance: number;   // 0..1. Crit deals +50% damage. Use 0 to disable.
  attackerCritBonus?: number;   // Multiplier on crit damage (default 1.5).
  defenderDef: number;          // Flat damage reduction (after block). Min 0.
  defenderBlock: number;        // Block points absorbed first (consumed in proportion to damage).
  defenderResistances?: Resistances;
  // Pre-rolled crit value in [0,1) so the engine stays deterministic. Caller
  // should pass `rng.next()`; tests pass an explicit value.
  critRoll: number;
  // Action ignores some/all defender block (e.g., Arcane Bolt: ignore 50%).
  // 0 = no block ignored, 1 = ignore all block.
  blockPiercing?: number;
}

export interface DamageOutput {
  hpDelta: number;              // Damage dealt to HP (>=0). Already accounts for block + def.
  blockConsumed: number;        // Block points absorbed (>=0).
  wasCrit: boolean;
  // Useful for floating combat text + combo tracking.
  finalDamage: number;          // The damage value AFTER crit + resistance, BEFORE block/def.
}

const DEFAULT_CRIT_BONUS = 1.5;

export function computeDamage(input: DamageInput): DamageOutput {
  const wasCrit = input.attackerCritChance > 0 && input.critRoll < input.attackerCritChance;
  const critMult = wasCrit ? (input.attackerCritBonus ?? DEFAULT_CRIT_BONUS) : 1;

  // attackerAtk is flat additive. We apply it to raw before crit so crits
  // multiply the buffed value (matches Slay-the-Spire-style ordering).
  const buffed = Math.max(0, input.raw + input.attackerAtk);
  const resistMult = input.defenderResistances?.[input.type] ?? 1;
  const finalDamage = Math.round(buffed * critMult * resistMult);

  // Block absorbs first. Some actions pierce a fraction of block.
  const piercing = clamp01(input.blockPiercing ?? 0);
  const effectiveBlock = Math.max(0, Math.round(input.defenderBlock * (1 - piercing)));
  const blockConsumed = Math.min(effectiveBlock, finalDamage);
  const afterBlock = finalDamage - blockConsumed;

  // Defense is flat reduction AFTER block. Floor at 0.
  const hpDelta = Math.max(0, afterBlock - input.defenderDef);

  return { hpDelta, blockConsumed, wasCrit, finalDamage };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Look up a flat resistance value. Used by enemy AI + UI tooltips. Returns
// 1.0 (neutral) when unspecified.
export function resistanceFor(resistances: Resistances | undefined, type: DamageType): number {
  return resistances?.[type] ?? 1;
}
