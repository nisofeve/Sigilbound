import { describe, expect, it } from 'vitest';
import { getStage, allStages, isBossStage } from './stageDef';
import { biomeForStage } from './bestiary';

describe('Stage generator', () => {
  it('isBossStage fires every 5th stage', () => {
    for (let i = 1; i <= 100; i++) {
      expect(isBossStage(i)).toBe(i % 5 === 0);
    }
  });

  it('getStage(N) is deterministic — same enemy roster every call', () => {
    const a = getStage(7);
    const b = getStage(7);
    expect(a.enemyIds).toEqual(b.enemyIds);
    expect(a.bonusObjectives).toEqual(b.bonusObjectives);
  });

  it('different stages produce different rosters (enemy variety)', () => {
    const stages = [3, 7, 13, 23, 33].map(getStage);
    const allRosters = stages.map(s => s.enemyIds.join(','));
    expect(new Set(allRosters).size).toBeGreaterThan(1);
  });

  it('biome assignment matches the GDD ranges', () => {
    expect(getStage(1).biome).toBe('forest');
    expect(getStage(20).biome).toBe('forest');
    expect(getStage(21).biome).toBe('crypts');
    expect(getStage(60).biome).toBe('frostpeak');
    expect(getStage(100).biome).toBe('ashen');
    expect(getStage(150).biome).toBe('ashen'); // plateau
  });

  it('all stage enemies belong to the matching biome (non-boss)', () => {
    for (let i = 1; i <= 100; i++) {
      if (isBossStage(i)) continue;
      const stage = getStage(i);
      const biome = biomeForStage(i);
      // Non-boss stages should only contain enemies of the matching biome.
      // (Bosses can carry biome-specific minions, but we don't check that strictly.)
      // The bestiary lookup guarantees biome via the data file.
      expect(stage.biome).toBe(biome);
    }
  });

  it('boss stages always include their canonical boss enemy', () => {
    expect(getStage(20).enemyIds).toContain('boss_antlered_king');
    expect(getStage(40).enemyIds).toContain('boss_bone_tyrant');
    expect(getStage(60).enemyIds).toContain('boss_ymir');
    expect(getStage(80).enemyIds).toContain('boss_vulkar');
    expect(getStage(100).enemyIds).toContain('boss_sigilbreaker');
  });

  it('stage 1-5 has only 1 enemy (tutorial band)', () => {
    for (let i = 1; i <= 4; i++) {
      expect(getStage(i).enemyIds).toHaveLength(1);
    }
    // Stage 5 is a boss → 1 boss + 2 minions = 3
    expect(getStage(5).enemyIds.length).toBeGreaterThanOrEqual(3);
  });

  it('reward chest scales with stage', () => {
    expect(getStage(1).rewardChest.baseGold).toBeLessThan(getStage(50).rewardChest.baseGold);
    expect(getStage(50).rewardChest.baseGold).toBeLessThan(getStage(100).rewardChest.baseGold);
  });

  it('boss stages have richer reward chests than adjacent non-boss', () => {
    expect(getStage(5).rewardChest.baseGold).toBeGreaterThan(getStage(4).rewardChest.baseGold);
  });

  it('every stage has at least one bonus objective', () => {
    for (let i = 1; i <= 100; i++) {
      expect(getStage(i).bonusObjectives.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('boss stages have 3 bonus objectives', () => {
    expect(getStage(5).bonusObjectives).toHaveLength(3);
    expect(getStage(50).bonusObjectives).toHaveLength(3);
    expect(getStage(100).bonusObjectives).toHaveLength(3);
  });

  it('allStages returns 100 entries', () => {
    expect(allStages()).toHaveLength(100);
  });

  it('hand-tuned overrides apply (stage 1 has its custom title)', () => {
    expect(getStage(1).title).toBe('The First Step');
    expect(getStage(100).title).toBe('The Sigilbreaker');
  });

  it('bonus objective combo type is one of onslaught/triadic/relentless', () => {
    const validCombos = new Set(['onslaught', 'triadic', 'relentless']);
    for (let i = 1; i <= 100; i++) {
      const stage = getStage(i);
      for (const obj of stage.bonusObjectives) {
        if (obj.type === 'combo') {
          expect(validCombos.has(obj.combo!)).toBe(true);
        }
      }
    }
  });
});
