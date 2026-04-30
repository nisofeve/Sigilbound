// Factory: build a BattleRunner from a stage number + player loadout.
// This is the high-level entry point that the UI (Phase 5) will call.
//
// Inputs:
//   - stageNumber: 1..100+
//   - playerLevel: 1..50
//   - equipment: EquippedSet (6 slots)
//   - talents: list of Perk objects (from talents.ts)  — Phase 5 wires effects
//   - reactions: list of reaction-card ids (from the reaction deck)
//   - seed (optional): shared seed for PvP / replay
//
// Output: a BattleRunner ready for endTurn() calls.
//
// Anything missing from the inputs uses sensible defaults so unit tests can
// call this with just a stage number.

import { BattleRunner, type BattleConfig } from './battle';
import { compileEquipment, type EquippedSet } from './equipment';
import { computePlayerStats } from './player';
import { getEnemy } from './bestiary';
import { getStage, type CombatStageDef } from './stageDef';
import type { EnemyDef } from './enemy';
import type { Perk } from './types';
import { upgradeStatModifiers } from './upgradeBuffs';

export interface StageRunInput {
  stageNumber: number;
  playerLevel: number;
  equipment?: EquippedSet;
  talents?: ReadonlyArray<Perk>;
  reactions?: ReadonlyArray<string>;
  seed?: number;
  // Phase 7 — player's custom combat deck (list of card ids). When
  // non-empty, BattleRunner uses this directly instead of building from
  // equipment additions. When empty/undefined, falls back to the gear-only
  // auto-deck.
  customDeck?: ReadonlyArray<string>;
  // Hardcore arc — initial HP carry-over.
  initialHp?: number;
  hardcore?: boolean;
  // Stronghold upgrades the player has bought.
  ownedUpgradeIds?: ReadonlyArray<string>;
  // Phase 3: card tier multipliers (maps card id to tier 1..5).
  cardTierMultipliers?: Record<string, number>;
}

export interface StageRunOutput {
  runner: BattleRunner;
  stage: CombatStageDef;
}

export function buildStageRun(input: StageRunInput): StageRunOutput {
  const stage = getStage(input.stageNumber);
  const enemyDefs: EnemyDef[] = [];
  for (const id of stage.enemyIds) {
    const def = getEnemy(id);
    if (def) {
      // Strip the `biome` field — it's bestiary metadata, not an EnemyDef.
      // Build a clean EnemyDef so the engine doesn't see the extra field.
      const { biome: _b, ...enemyDef } = def;
      void _b;
      enemyDefs.push(enemyDef as EnemyDef);
    }
  }

  const compiled = input.equipment
    ? compileEquipment(input.equipment, input.cardTierMultipliers)
    : null;
  const talentStatModifiers = (input.talents ?? [])
    .map(t => talentToStatModifier(t))
    .filter((m): m is NonNullable<ReturnType<typeof talentToStatModifier>> => m !== null);

  // Stronghold upgrades fold into stats AND get passed to the runner for
  // their runtime hooks (regen, starting block, on-kill heal, etc.).
  const upgradeMods = upgradeStatModifiers(input.ownedUpgradeIds ?? []);

  const playerStats = computePlayerStats({
    level: input.playerLevel,
    modifiers: [
      ...(compiled?.modifiers ?? []),
      ...talentStatModifiers,
      ...upgradeMods,
    ],
  });

  const config: BattleConfig = {
    seed: input.seed ?? input.stageNumber,
    playerStats,
    equipment: input.equipment,                       // for deck/triggers/reaction adds
    enemyDefs,
    reactions: input.reactions,
    // Phase 6C: forward talents so the runner can wire combat-runtime effects
    // (Battlecry, Aegis, Sigilbound Master, Lucky Streak crit-heal, etc.).
    talents: input.talents,
    // Phase 7: custom deck overrides equipment-only deck when provided.
    deck: input.customDeck && input.customDeck.length > 0 ? input.customDeck : undefined,
    initialHp: input.initialHp,
    hardcore: input.hardcore,
    ownedUpgradeIds: input.ownedUpgradeIds,
    cardTierMultipliers: input.cardTierMultipliers,
  };

  return { runner: new BattleRunner(config), stage };
}

// Map a talent (Perk) to a StatModifier shape where directly applicable.
// Returns null for talents whose effect runs at runtime (combat-specific
// triggers wired in Phase 5 — Battlecry, Aegis, Sigilbound Master, etc.).
function talentToStatModifier(t: Perk): import('./player').StatModifier | null {
  switch (t.modifier.type) {
    case 'hand_size_delta':       return { handSize: t.modifier.value };
    case 'sigil_slots_delta':     return { sigilSlots: t.modifier.value };
    case 'max_hp_bonus':          return { maxHp: t.modifier.value };
    case 'crit_chance_bonus':     return { critChance: t.modifier.pct };
    case 'speed_bonus':           return { speed: t.modifier.pct };
    case 'damage_type_bonus':
      // Fold as resistance bonus on outgoing? No — outgoing-only. Skip and
      // wire in Phase 5 via the runner.
      return null;
    default:
      return null;
  }
}
