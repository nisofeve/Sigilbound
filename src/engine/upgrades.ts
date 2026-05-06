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
