import upgradesJson from '@data/upgrades.json';
import type { Upgrade, UpgradeEffect, UpgradeZone } from './types';

const ALL_UPGRADES = upgradesJson as Upgrade[];
const byId = new Map(ALL_UPGRADES.map(u => [u.id, u]));

export function allUpgrades(): Upgrade[] {
  return ALL_UPGRADES.slice();
}

export function getUpgrade(id: string): Upgrade {
  const u = byId.get(id);
  if (!u) throw new Error(`Unknown upgrade id: ${id}`);
  return u;
}

export function upgradesByZone(zone: UpgradeZone): Upgrade[] {
  return ALL_UPGRADES.filter(u => u.zone === zone).sort((a, b) => a.tier - b.tier);
}

export function canBuy(upgrade: Upgrade, owned: Set<string>, bankCoins: number): boolean {
  if (owned.has(upgrade.id)) return false;
  if (bankCoins < upgrade.cost) return false;
  if (upgrade.prerequisite && !owned.has(upgrade.prerequisite)) return false;
  return true;
}

export function sumUpgradeEffect(ownedIds: string[], type: UpgradeEffect['type']): number {
  let total = 0;
  for (const id of ownedIds) {
    const u = byId.get(id);
    if (!u) continue;
    if (u.effect.type === type && 'value' in u.effect) {
      total += u.effect.value;
    }
  }
  return total;
}

// Hard ceiling — design cap on talent / perk slot count regardless of
// owned upgrades. Excess perk_slots_delta tiers contribute nothing.
const MAX_PERK_SLOTS = 5;

export function maxPerkSlots(ownedIds: string[]): number {
  // Base is 2 (per GDD §Perks). Perk Slot upgrades add, capped at MAX_PERK_SLOTS.
  return Math.min(MAX_PERK_SLOTS, 2 + sumUpgradeEffect(ownedIds, 'perk_slots_delta'));
}

// === Level-gated upgrade visibility ===
//
// Tier 1 upgrades are always visible (level 1). Higher tiers unlock gradually
// as the player levels up. Upgrades within the same tier are spread evenly
// across the tier's level range so something new appears every few levels.

const TIER_LEVEL_RANGES: Record<number, [number, number]> = {
  1:  [1,  2],
  2:  [3,  5],
  3:  [6,  7],
  4:  [8,  10],
  5:  [11, 12],
  6:  [13, 15],
  7:  [16, 17],
  8:  [18, 20],
  9:  [21, 22],
  10: [23, 25],
  11: [26, 27],
  12: [28, 30],
  13: [31, 32],
  14: [33, 35],
  15: [36, 37],
  16: [38, 40],
  17: [41, 42],
  18: [43, 45],
  19: [46, 47],
  20: [48, 50],
};

// Returns the player level required to see a given upgrade in the Stronghold.
export function levelForUpgrade(upg: Upgrade): number {
  const range = TIER_LEVEL_RANGES[upg.tier] ?? [1, 1];
  const tieredUpgrades = ALL_UPGRADES
    .filter(u => u.tier === upg.tier)
    .sort((a, b) => a.id.localeCompare(b.id));
  const idx = tieredUpgrades.findIndex(u => u.id === upg.id);
  const count = tieredUpgrades.length;
  if (count <= 1) return range[0];
  const level = range[0] + Math.round((idx / (count - 1)) * (range[1] - range[0]));
  return Math.max(range[0], Math.min(range[1], level));
}

// Returns all upgrades that first become visible when claiming a specific level.
export function upgradesUnlockedAtLevel(level: number): Upgrade[] {
  return ALL_UPGRADES.filter(u => levelForUpgrade(u) === level);
}
