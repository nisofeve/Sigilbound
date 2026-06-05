// Stronghold-upgrade compiler — turns owned upgrade ids into the two shapes
// the combat engine consumes:
//
//   1. StatModifier[] folded into computePlayerStats() via the factory.
//      Covers atk / def / max-hp / crit / speed / stamina / sigil-slots /
//      hand-size / resistances.
//
//   2. UpgradeBuffs — a flat runtime bag the BattleRunner reads at hot paths
//      (turn end, enemy kill, low-hp, combo, etc.). Mirrors the talent-state
//      bag so the two systems stack additively.
//
// Effects with no combat surface (gold drops, shop discounts, talent-tier
// unlocks, etc.) flow through the storage layer instead — see profile.ts.

import type { StatModifier } from './player';
import type { DamageType, Resistances } from './damage';
import { allUpgrades } from './upgrades';
import type { Upgrade, UpgradeEffect } from './types';

// ─── Runtime buff bag ─────────────────────────────────────────────────────────

export interface UpgradeBuffs {
  // Combat-time additive bonuses
  comboDamageBonus: number;          // +pct to combo strike damage (0.10 = +10%)
  critDamageBonus: number;           // +pct to crit multiplier base of 1.5
  globalBlockPiercing: number;       // 0..1 — fraction of enemy block bypassed
  firstActionDamageBonus: number;    // +pct to the first action card each turn
  cardReplicateChance: number;       // 0..1 — chance an action card refires
  allComboDamageMult: number;        // multiplier on (combo_mult-1); 1.0 = no change

  // Health / block management
  startingBlock: number;             // block granted at battle start
  stageStartHeal: number;            // heal at battle start
  regenPerTurn: number;              // HP healed at end of player turn
  onKillHeal: number;                // HP healed per enemy killed
  blockCarryCap: number;             // 0 = no carry; otherwise cap
  onLethalSurvive: number;           // remaining "Phoenix Ember" charges (0/1)
  aegisThreshold: number;            // 0..1 — HP fraction
  aegisBlock: number;                // block granted on aegis trigger

  // Card flow
  turnOneExtraDraw: number;          // extra cards drawn on turn 1
  comboStaminaRefund: number;        // stamina refunded per combo
  tacticStaminaDiscount: number;     // -N to all tactic costs (min 0)

  // Per-damage-type outgoing bonuses (additive across all sources)
  damageTypeBonus: Partial<Record<DamageType, number>>;

  // Heal multiplier: additive bonus fraction (0.20 = +20%). Applied to all
  // in-combat heals (regen, on-kill, tactic heals, stage-start heal).
  healEffectivenessMult: number;
}

export function emptyUpgradeBuffs(): UpgradeBuffs {
  return {
    comboDamageBonus: 0,
    critDamageBonus: 0,
    globalBlockPiercing: 0,
    firstActionDamageBonus: 0,
    cardReplicateChance: 0,
    allComboDamageMult: 1,
    startingBlock: 0,
    stageStartHeal: 0,
    regenPerTurn: 0,
    onKillHeal: 0,
    blockCarryCap: 0,
    onLethalSurvive: 0,
    aegisThreshold: 0,
    aegisBlock: 0,
    turnOneExtraDraw: 0,
    comboStaminaRefund: 0,
    tacticStaminaDiscount: 0,
    damageTypeBonus: {},
    healEffectivenessMult: 0,
  };
}

// ─── Compilation ──────────────────────────────────────────────────────────────

/**
 * Compile a list of owned upgrade ids into runtime buffs. Unknown ids are
 * silently skipped so old saves with retired upgrades don't crash.
 */
export function compileUpgradeBuffs(ownedIds: ReadonlyArray<string>): UpgradeBuffs {
  const out = emptyUpgradeBuffs();
  const all = allUpgrades();
  const byId = new Map(all.map(u => [u.id, u]));

  // Two-pass: first add additive numerics, then apply multiplicative ones
  // (specifically `all_combo_damage_mult` which scales the combo bonus space).
  for (const id of ownedIds) {
    const u = byId.get(id);
    if (!u) continue;
    applyEffectToBuffs(u.effect, out);
  }
  return out;
}

function applyEffectToBuffs(eff: UpgradeEffect, b: UpgradeBuffs): void {
  switch (eff.type) {
    case 'combo_damage_bonus':       b.comboDamageBonus       += eff.value; break;
    case 'crit_damage_bonus':        b.critDamageBonus        += eff.value; break;
    case 'global_block_piercing':    b.globalBlockPiercing    += eff.value; break;
    case 'first_action_damage_bonus':b.firstActionDamageBonus = Math.max(b.firstActionDamageBonus, eff.value); break;
    case 'card_replicate_chance':    b.cardReplicateChance    += eff.value; break;
    case 'all_combo_damage_mult':    b.allComboDamageMult     = Math.max(b.allComboDamageMult, eff.mult); break;

    case 'starting_block':           b.startingBlock          += eff.value; break;
    case 'stage_start_heal':         b.stageStartHeal         += eff.value; break;
    case 'regen_per_turn':           b.regenPerTurn           += eff.value; break;
    case 'on_kill_heal':             b.onKillHeal             += eff.value; break;
    case 'block_carry_cap':          b.blockCarryCap          = Math.max(b.blockCarryCap, eff.value); break;
    case 'on_lethal_survive':        b.onLethalSurvive        += eff.value; break;

    case 'auto_block_low_hp':
      if (eff.threshold > b.aegisThreshold) {
        b.aegisThreshold = eff.threshold;
        b.aegisBlock = eff.block;
      } else if (eff.threshold === b.aegisThreshold) {
        b.aegisBlock = Math.max(b.aegisBlock, eff.block);
      }
      break;

    case 'turn_one_extra_draw':      b.turnOneExtraDraw       += eff.value; break;
    case 'combo_stamina_refund':     b.comboStaminaRefund     += eff.value; break;
    case 'tactic_stamina_discount':  b.tacticStaminaDiscount  += eff.value; break;

    case 'damage_type_bonus': {
      const t = eff.element as DamageType;
      b.damageTypeBonus[t] = (b.damageTypeBonus[t] ?? 0) + eff.value;
      break;
    }

    case 'heal_effectiveness_mult': b.healEffectivenessMult += eff.value; break;

    // Effects converted to StatModifiers (handled by upgradeStatModifiers below).
    case 'max_hp_bonus':
    case 'atk_bonus':
    case 'def_bonus':
    case 'crit_chance_bonus':
    case 'speed_bonus':
    case 'stamina_bonus':
    case 'sigil_slots_delta':
    case 'hand_size_delta':
    case 'resistance_bonus':
    case 'all_resist_bonus':
      break;

    // Out-of-scope for combat (consumed by storage / shop / meta layers).
    case 'starting_coins':
    case 'plot_count_delta':
    case 'starting_deck_extra':
    case 'starting_deck_extra_card':
    case 'first_seed_grow_delta':
    case 'global_sale_mult':
    case 'draft_count_delta':
    case 'perk_slots_delta':
    case 'gold_drop_bonus':
    case 'craft_discount':
    case 'unlock_upgrade_tier':
    case 'reaction_slots_delta':
    case 'free_reroll_per_run':
    case 'noop':
      break;
  }
}

// ─── Stat modifiers (folded into computePlayerStats) ─────────────────────────

/**
 * Convert stat-shaped upgrade effects into StatModifier objects. The factory
 * concatenates these with equipment + talent modifiers before computing the
 * final stat block.
 *
 * Resistances are multiplicative in computePlayerStats (compounding), so
 * each upgrade contributes its own multiplier.
 */
export function upgradeStatModifiers(ownedIds: ReadonlyArray<string>): StatModifier[] {
  const all = allUpgrades();
  const byId = new Map(all.map(u => [u.id, u]));
  const mods: StatModifier[] = [];
  for (const id of ownedIds) {
    const u = byId.get(id);
    if (!u) continue;
    const m = effectToStatModifier(u);
    if (m) mods.push(m);
  }
  return mods;
}

function effectToStatModifier(u: Upgrade): StatModifier | null {
  const e = u.effect;
  switch (e.type) {
    case 'max_hp_bonus':       return { maxHp: e.value };
    case 'atk_bonus':          return { atk: e.value };
    case 'def_bonus':          return { def: e.value };
    case 'crit_chance_bonus':  return { critChance: e.value };
    case 'speed_bonus':        return { speed: e.value };
    case 'stamina_bonus':      return { stamina: e.value };
    case 'sigil_slots_delta':  return { sigilSlots: e.value };
    case 'hand_size_delta':    return { handSize: e.value };

    case 'resistance_bonus': {
      // value = damage multiplier (0.8 = take 80% damage = 20% resist).
      const res: Resistances = {};
      res[e.element as DamageType] = e.value;
      return { resistances: res };
    }
    case 'all_resist_bonus': {
      // value = additional resist fraction (0.10 = 10% reduction across all).
      // Convert to a multiplier and apply to every damage type.
      const mult = 1 - e.value;
      const res: Resistances = {
        steel: mult, pierce: mult, pyre: mult, frost: mult, arcane: mult,
        fire: mult, ice: mult, dark: mult, holy: mult, nature: mult, thunder: mult, physical: mult,
      } as unknown as Resistances;
      return { resistances: res };
    }

    default:
      return null;
  }
}
