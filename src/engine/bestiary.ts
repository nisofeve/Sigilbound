// Bestiary loader. The data file is a JSON array of EnemyDef extended with
// a `biome` tag (forest / crypts / frostpeak / volcano / ashen). The biome
// field is not part of EnemyDef itself — it's metadata used by the stage
// generator to pick which enemies fit which stage.

import type { EnemyDef, Archetype } from './enemy';
import enemiesData from '../data/enemies.json';

export type Biome = 'forest' | 'crypts' | 'frostpeak' | 'volcano' | 'ashen';

export const BIOMES: ReadonlyArray<Biome> = [
  'forest', 'crypts', 'frostpeak', 'volcano', 'ashen',
];

// Stage range each biome covers (per GDD §Run Structure).
export const BIOME_RANGES: Record<Biome, { min: number; max: number }> = {
  forest:    { min: 1,  max: 20 },
  crypts:    { min: 21, max: 40 },
  frostpeak: { min: 41, max: 60 },
  volcano:   { min: 61, max: 80 },
  ashen:     { min: 81, max: 100 },
};

export interface BestiaryEntry extends EnemyDef {
  biome: Biome;
}

const ALL: ReadonlyArray<BestiaryEntry> = Object.freeze(
  (enemiesData as BestiaryEntry[]).map(e => Object.freeze(e)),
);
const BY_ID = new Map(ALL.map(e => [e.id, e]));

export function allEnemies(): ReadonlyArray<BestiaryEntry> { return ALL; }

export function getEnemy(id: string): BestiaryEntry | undefined {
  return BY_ID.get(id);
}

export function enemiesByBiome(biome: Biome): ReadonlyArray<BestiaryEntry> {
  return ALL.filter(e => e.biome === biome);
}

export function enemiesByArchetype(archetype: Archetype): ReadonlyArray<BestiaryEntry> {
  return ALL.filter(e => e.archetype === archetype);
}

// Stage → Biome mapping. Stages 101+ plateau into the Ashen Citadel.
export function biomeForStage(stage: number): Biome {
  if (stage <= 20) return 'forest';
  if (stage <= 40) return 'crypts';
  if (stage <= 60) return 'frostpeak';
  if (stage <= 80) return 'volcano';
  return 'ashen';
}
