import perksJson from '@data/perks.json';
import type { Perk, PerkModifier } from './types';

const ALL_PERKS = perksJson as Perk[];
const byId = new Map(ALL_PERKS.map(p => [p.id, p]));

export function allPerks(): Perk[] {
  return ALL_PERKS.slice();
}

export function getPerk(id: string): Perk {
  const p = byId.get(id);
  if (!p) throw new Error(`Unknown perk id: ${id}`);
  return p;
}

// Sum the values of every active modifier of a given type. Unknown / no-op
// modifiers contribute 0, so unimplemented perks degrade gracefully.
// Type-narrowing trick: cast through unknown to read .value when present.
export function sumModifier(perks: Perk[], type: PerkModifier['type']): number {
  let total = 0;
  for (const p of perks) {
    if (p.modifier.type === type) {
      const v = (p.modifier as unknown as { value?: number }).value;
      if (typeof v === 'number') total += v;
    }
  }
  return total;
}

export function hasModifier(perks: Perk[], type: PerkModifier['type']): boolean {
  return perks.some(p => p.modifier.type === type);
}

// Find the first perk modifier of a given type and return it raw, for perks
// that need richer fields than just `value` (goal_harvest_crop, tool_draw_bonus
// with cap, etc.). Returns undefined if no equipped perk has that modifier.
export function findModifier<T extends PerkModifier['type']>(
  perks: Perk[],
  type: T,
): Extract<PerkModifier, { type: T }> | undefined {
  for (const p of perks) {
    if (p.modifier.type === type) return p.modifier as Extract<PerkModifier, { type: T }>;
  }
  return undefined;
}

// Power score for matchmaking (GDD §Perk-Aware Matchmaking).
// Common 1, Uncommon 3, Rare 5, Epic 8, Legendary 12, Mythic 16.
export function perkPowerScore(perks: Perk[]): number {
  const weight: Record<Perk['rarity'], number> = {
    common: 1, uncommon: 3, rare: 5, epic: 8, legendary: 12, mythic: 16,
  };
  return perks.reduce((sum, p) => sum + weight[p.rarity], 0);
}
