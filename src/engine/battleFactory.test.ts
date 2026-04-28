import { describe, expect, it } from 'vitest';
import { buildStageRun } from './battleFactory';
import { getTalent } from './talents';
import { getEquipment } from './equipmentCatalog';
import { equip, emptyEquippedSet } from './equipment';

describe('buildStageRun', () => {
  it('produces a runner from just stage + level', () => {
    const { runner, stage } = buildStageRun({ stageNumber: 1, playerLevel: 1 });
    expect(stage.number).toBe(1);
    expect(runner.state.outcome).toBe('in_progress');
    expect(runner.state.enemies.length).toBeGreaterThanOrEqual(1);
  });

  it('stage 1 has 1 enemy (tutorial)', () => {
    const { runner } = buildStageRun({ stageNumber: 1, playerLevel: 1 });
    expect(runner.state.enemies).toHaveLength(1);
  });

  it('boss stage 5 spawns boss + minions', () => {
    const { runner } = buildStageRun({ stageNumber: 5, playerLevel: 1 });
    expect(runner.state.enemies.length).toBeGreaterThanOrEqual(2);
    const isBoss = runner.state.enemies.some(e => e.archetype === 'boss');
    expect(isBoss).toBe(true);
  });

  it('equipment folds into player stats (Heart of the Sigilkeeper +1 slot)', () => {
    const heart = getEquipment('heart_of_sigilkeeper')!;
    const set = equip(emptyEquippedSet(), heart);
    const { runner } = buildStageRun({ stageNumber: 1, playerLevel: 1, equipment: set });
    expect(runner.state.slots).toHaveLength(4);
  });

  it('talent: Bigger Hand grants +1 handSize via stat compilation', () => {
    const biggerHand = getTalent('talent.bigger_hand')!;
    const { runner } = buildStageRun({
      stageNumber: 1,
      playerLevel: 1,
      talents: [biggerHand],
    });
    expect(runner.state.player.stats.handSize).toBe(6); // base 5 + 1
  });

  it('talent: Extra Sigil grants +1 sigilSlots', () => {
    const extra = getTalent('talent.extra_sigil')!;
    const { runner } = buildStageRun({
      stageNumber: 1,
      playerLevel: 1,
      talents: [extra],
    });
    expect(runner.state.slots).toHaveLength(4);
  });

  it('talent + equipment stack (Extra Sigil + Heart of the Sigilkeeper = +2 slots)', () => {
    const heart = getEquipment('heart_of_sigilkeeper')!;
    const extra = getTalent('talent.extra_sigil')!;
    const set = equip(emptyEquippedSet(), heart);
    const { runner } = buildStageRun({
      stageNumber: 1,
      playerLevel: 1,
      equipment: set,
      talents: [extra],
    });
    expect(runner.state.slots).toHaveLength(5); // base 3 + 1 amulet + 1 talent
  });

  it('talent: Vigorous (max_hp_bonus) grants +10 max HP', () => {
    const vig = getTalent('talent.vigorous')!;
    const { runner } = buildStageRun({
      stageNumber: 1,
      playerLevel: 1,
      talents: [vig],
    });
    expect(runner.state.player.stats.maxHp).toBe(50 + 10);
  });

  it('seeded runs are deterministic', () => {
    const a = buildStageRun({ stageNumber: 7, playerLevel: 5, seed: 42 });
    const b = buildStageRun({ stageNumber: 7, playerLevel: 5, seed: 42 });
    expect(a.runner.state.enemies.map(e => e.intent.kind)).toEqual(
      b.runner.state.enemies.map(e => e.intent.kind),
    );
  });

  it('Battlecry compiles into talent runtime state without touching stats', () => {
    const battlecry = getTalent('talent.battlecry')!;
    const { runner } = buildStageRun({
      stageNumber: 1,
      playerLevel: 1,
      talents: [battlecry],
    });
    // Stats are untouched (Battlecry is a runtime damage modifier, not a stat).
    expect(runner.state.player.stats.maxHp).toBe(50);
    // But the talent's runtime field is populated for the resolve hot path.
    expect(runner.state.talents.firstActionDamageBonus).toBe(0.25);
  });
});
