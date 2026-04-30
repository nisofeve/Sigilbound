// Perk-inventory helpers. Tracks consumable charges, equip/unequip, and
// run-start consumption. Starter perks (talent.battlecry, talent.vigorous)
// are permanent and never decrement.

import { saveProfile } from './profile';
import { STARTER_PERKS, type Profile } from './types';

// Helper used across the codebase to decide whether a perk is consumed when
// equipped on a run.
export function isStarterPerk(perkId: string): boolean {
  return STARTER_PERKS.includes(perkId);
}

// Total charges available for `perkId`. Starter perks always return Infinity
// (never decrement). Returns 0 for unowned consumable perks.
export function perkChargesAvailable(profile: Profile, perkId: string): number {
  if (isStarterPerk(perkId)) return Infinity;
  return profile.perksInventory[perkId] ?? 0;
}

export function setEquippedPerks(profile: Profile, ids: string[]): Profile {
  // Defensive: only let through perks that are starters or actually have
  // charges. Catches a stale-equip bug if someone hand-edited the JSON.
  const cleaned = ids.filter(id => isStarterPerk(id) || (profile.perksInventory[id] ?? 0) > 0);
  const next: Profile = { ...profile, perksEquipped: cleaned };
  saveProfile(next);
  return next;
}

// Burn one charge per equipped consumable perk. Called from the run-start
// path so the charges are gone whether the player completes the run or
// rage-quits — same trade-off as gem spends.
export function consumeEquippedPerksForRun(profile: Profile): Profile {
  const inv = { ...profile.perksInventory };
  for (const id of profile.perksEquipped) {
    if (isStarterPerk(id)) continue;
    const cur = inv[id] ?? 0;
    if (cur <= 1) delete inv[id];
    else inv[id] = cur - 1;
  }
  // Drop any equipped consumables that are now exhausted from the equip list,
  // so the next perk-loadout screen reflects the new reality.
  const equipped = profile.perksEquipped.filter(id =>
    isStarterPerk(id) || (inv[id] ?? 0) > 0,
  );
  const next: Profile = { ...profile, perksInventory: inv, perksEquipped: equipped };
  saveProfile(next);
  return next;
}

// Add `count` charges of a perk to the inventory. Used by shop purchases,
// level-up rewards, and battle pass payouts. Starter perks ignore this —
// they're permanent and don't need an inventory entry.
export function addPerkCharges(profile: Profile, perkId: string, count = 1): Profile {
  if (isStarterPerk(perkId) || count <= 0) return profile;
  const inv = { ...profile.perksInventory };
  inv[perkId] = (inv[perkId] ?? 0) + count;
  // Mirror into perksOwned for any UI / achievement code that still reads
  // the legacy list.
  const owned = profile.perksOwned.includes(perkId)
    ? profile.perksOwned
    : [...profile.perksOwned, perkId];
  const next: Profile = { ...profile, perksInventory: inv, perksOwned: owned };
  saveProfile(next);
  return next;
}
