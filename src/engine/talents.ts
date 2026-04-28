// Talent loader. The data file is a JSON array of `Perk` (since talents
// inherit Plotbound's Perk type — see GDD Migration §3 "reused systems").
// Sigilbound talents add new modifier kinds that the BattleRunner will read
// in Phase 5; until then the talents are catalog-loadable + UI-ready.

import type { Perk } from './types';
import talentsData from '../data/talents.json';

const ALL: ReadonlyArray<Perk> = Object.freeze(
  (talentsData as Perk[]).map(t => Object.freeze(t)),
);
const BY_ID = new Map(ALL.map(t => [t.id, t]));

export function allTalents(): ReadonlyArray<Perk> { return ALL; }

export function getTalent(id: string): Perk | undefined {
  return BY_ID.get(id);
}

export function talentsByRarity(rarity: Perk['rarity']): ReadonlyArray<Perk> {
  return ALL.filter(t => t.rarity === rarity);
}
