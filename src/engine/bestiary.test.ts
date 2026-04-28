import { describe, expect, it } from 'vitest';
import {
  allEnemies,
  biomeForStage,
  BIOMES,
  BIOME_RANGES,
  enemiesByArchetype,
  enemiesByBiome,
  getEnemy,
} from './bestiary';

describe('Bestiary data', () => {
  it('loads at least 25 enemies (5 biomes × at least 5)', () => {
    expect(allEnemies().length).toBeGreaterThanOrEqual(25);
  });

  it('every enemy has a known biome', () => {
    for (const e of allEnemies()) {
      expect(BIOMES).toContain(e.biome);
    }
  });

  it('ids are unique', () => {
    const ids = allEnemies().map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every biome has at least 5 enemies (variety per stage)', () => {
    for (const b of BIOMES) {
      expect(enemiesByBiome(b).length, `biome ${b} too sparse`).toBeGreaterThanOrEqual(5);
    }
  });

  it('every biome has its boss', () => {
    for (const b of BIOMES) {
      const bosses = enemiesByBiome(b).filter(e => e.archetype === 'boss');
      expect(bosses.length, `biome ${b} missing boss`).toBeGreaterThanOrEqual(1);
    }
  });

  it('non-boss biomes feature multiple archetypes for variety', () => {
    for (const b of BIOMES) {
      const archs = new Set(enemiesByBiome(b).filter(e => e.archetype !== 'boss').map(e => e.archetype));
      expect(archs.size, `biome ${b} too few archetypes`).toBeGreaterThanOrEqual(3);
    }
  });

  it('enemiesByArchetype returns matching entries', () => {
    const bosses = enemiesByArchetype('boss');
    expect(bosses.length).toBeGreaterThanOrEqual(5);
  });

  it('getEnemy looks up by id', () => {
    expect(getEnemy('forest_goblin')?.name).toBe('Goblin Slasher');
    expect(getEnemy('nope')).toBeUndefined();
  });

  it('biomeForStage maps GDD ranges', () => {
    expect(biomeForStage(1)).toBe('forest');
    expect(biomeForStage(20)).toBe('forest');
    expect(biomeForStage(21)).toBe('crypts');
    expect(biomeForStage(40)).toBe('crypts');
    expect(biomeForStage(41)).toBe('frostpeak');
    expect(biomeForStage(60)).toBe('frostpeak');
    expect(biomeForStage(61)).toBe('volcano');
    expect(biomeForStage(80)).toBe('volcano');
    expect(biomeForStage(81)).toBe('ashen');
    expect(biomeForStage(100)).toBe('ashen');
    expect(biomeForStage(150)).toBe('ashen'); // plateau
  });

  it('BIOME_RANGES cover stages 1-100 contiguously', () => {
    let prev = 0;
    for (const b of BIOMES) {
      expect(BIOME_RANGES[b].min).toBe(prev + 1);
      prev = BIOME_RANGES[b].max;
    }
    expect(prev).toBe(100);
  });
});
