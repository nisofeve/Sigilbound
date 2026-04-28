// Sigilbound combat shop storage helpers — applies purchases to the
// profile and handles daily rollover. Mirrors the legacy shop.ts pattern
// but uses crystals/soul-shards + the new combatCardInventory.

import { rollCombatShop, priceFor, rerollCostFor, type CombatShopEntry } from '@engine/index';
import type { Profile } from './types';

// === Daily rollover ===

/**
 * Reset combat-shop-bought tracking when the day flips. Returns the
 * profile unchanged if today's already current. UI calls this on every
 * shop view to keep state consistent.
 */
export function rolloverCombatShop(profile: Profile, todayISO: string): Profile {
  if (profile.combatShopISO === todayISO) return profile;
  return {
    ...profile,
    combatShopISO: todayISO,
    combatShopBoughtIds: [],
  };
}

/**
 * Get today's roll. The shop seed is dayKey + reroll-count; when we
 * reroll we don't track the count separately because rerolls aren't
 * supported in the v1 shop (cost-managed inside the engine fn anyway).
 * For v1 this just always returns roll(today, 0).
 */
export function getCombatShopRoll(todayISO: string): CombatShopEntry[] {
  return rollCombatShop(todayISO, 0);
}

// === Purchases ===

export type CombatBuyResult = { ok: true; profile: Profile } | { ok: false; reason: string };

/**
 * Buy one card from the shop. Pays in either gold or crystals; the caller
 * picks. Cards purchased are added to the player's combatCardInventory and
 * the entry's id is marked as bought today.
 */
export function buyCombatShopEntry(
  profile: Profile,
  entry: CombatShopEntry,
  payWith: 'gold' | 'crystals',
): CombatBuyResult {
  if (profile.combatShopBoughtIds.includes(entry.cardId)) {
    return { ok: false, reason: 'Already bought today' };
  }
  const price = priceFor(entry.def);
  if (payWith === 'gold' && profile.bankCoins < price.gold) {
    return { ok: false, reason: 'Not enough gold' };
  }
  if (payWith === 'crystals' && profile.gems < price.crystals) {
    return { ok: false, reason: 'Not enough crystals' };
  }

  const next: Profile = {
    ...profile,
    bankCoins: payWith === 'gold' ? profile.bankCoins - price.gold : profile.bankCoins,
    gems: payWith === 'crystals' ? profile.gems - price.crystals : profile.gems,
    combatCardInventory: {
      ...profile.combatCardInventory,
      [entry.cardId]: (profile.combatCardInventory[entry.cardId] ?? 0) + 1,
    },
    combatShopBoughtIds: [...profile.combatShopBoughtIds, entry.cardId],
  };
  return { ok: true, profile: next };
}

// === Reroll ===

/** Stub — v1 has no manual reroll; rerollCostFor is exposed for future UI. */
export function combatShopRerollCost(): number {
  return rerollCostFor(0);
}

// === Deck mutation ===

const DECK_MIN = 10;
const DECK_MAX = 30;

/**
 * Add a card id to the player's combat deck (if they own at least one
 * unused copy and the deck isn't at the cap).
 */
export function addToCombatDeck(profile: Profile, cardId: string): Profile | null {
  if (profile.combatDeck.length >= DECK_MAX) return null;
  const owned = profile.combatCardInventory[cardId] ?? 0;
  const inDeck = profile.combatDeck.filter(id => id === cardId).length;
  if (inDeck >= owned) return null; // can't add more than you own
  return { ...profile, combatDeck: [...profile.combatDeck, cardId] };
}

/** Remove the first occurrence of a card id from the combat deck. */
export function removeFromCombatDeck(profile: Profile, cardId: string): Profile | null {
  if (profile.combatDeck.length <= DECK_MIN) return null;
  const idx = profile.combatDeck.indexOf(cardId);
  if (idx < 0) return null;
  const next = profile.combatDeck.slice();
  next.splice(idx, 1);
  return { ...profile, combatDeck: next };
}

export function combatDeckLimits(): { min: number; max: number } {
  return { min: DECK_MIN, max: DECK_MAX };
}
