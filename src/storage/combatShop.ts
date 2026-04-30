// Sigilbound combat shop storage helpers — applies purchases to the
// profile and handles daily rollover. Mirrors the legacy shop.ts pattern
// but uses crystals/soul-shards + the new combatCardInventory.

import {
  rollCombatShop,
  priceFor,
  rerollCostFor,
  cardUpgradeCostFor,
  isCardMaxLevel,
  MAX_CARD_LEVEL,
  getAction,
  getTactic,
  allEquipment,
  type CombatShopEntry,
  type CombatShopRoll,
  type Rarity,
} from '@engine/index';
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
    combatShopBoughtCounts: {},
    combatShopRerolls: 0,
  };
}

/**
 * Get today's roll. The shop seed is dayKey + reroll-count; when we
 * reroll we don't track the count separately because rerolls aren't
 * supported in the v1 shop (cost-managed inside the engine fn anyway).
 * For v1 this just always returns roll(today, 0).
 */
export function getCombatShopRoll(profile: Profile, todayISO: string): CombatShopRoll {
  return rollCombatShop(todayISO, profile.combatShopRerolls);
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
  quantity: number = 1
): CombatBuyResult {
  const boughtCount = profile.combatShopBoughtCounts[entry.cardId] ?? 0;
  if (boughtCount + quantity > entry.copiesAvailable) {
    return { ok: false, reason: 'Not enough stock available' };
  }
  
  const price = priceFor(entry.def, entry.kind);
  const totalGold = price.gold * quantity;
  const totalCrystals = price.crystals * quantity;

  if (payWith === 'gold' && profile.bankCoins < totalGold) {
    return { ok: false, reason: 'Not enough gold' };
  }
  if (payWith === 'crystals' && profile.gems < totalCrystals) {
    return { ok: false, reason: 'Not enough crystals' };
  }

  const next: Profile = {
    ...profile,
    bankCoins: payWith === 'gold' ? profile.bankCoins - totalGold : profile.bankCoins,
    gems: payWith === 'crystals' ? profile.gems - totalCrystals : profile.gems,
    combatCardInventory: { ...profile.combatCardInventory },
    perksInventory: { ...profile.perksInventory },
    perksOwned: [...profile.perksOwned],
    combatShopBoughtCounts: {
      ...profile.combatShopBoughtCounts,
      [entry.cardId]: boughtCount + quantity,
    },
    // Keep legacy boughtIds for backward compatibility if needed.
    combatShopBoughtIds: [...profile.combatShopBoughtIds, entry.cardId],
  };

  // Route the purchased items to their respective inventories.
  if (entry.kind === 'action' || entry.kind === 'tactic' || entry.kind === 'equipment') {
    next.combatCardInventory[entry.cardId] = (next.combatCardInventory[entry.cardId] ?? 0) + quantity;
  } else if (entry.kind === 'talent') {
    next.perksInventory[entry.cardId] = (next.perksInventory[entry.cardId] ?? 0) + quantity;
    if (!next.perksOwned.includes(entry.cardId)) {
      next.perksOwned.push(entry.cardId);
    }
  }

  return { ok: true, profile: next };
}

// === Reroll ===

/** Cost to refresh the shop. */
export function combatShopRerollCost(profile: Profile): number {
  return rerollCostFor(profile.combatShopRerolls);
}

export function rerollCombatShop(profile: Profile): CombatBuyResult {
  const cost = combatShopRerollCost(profile);
  if (profile.gems < cost) {
    return { ok: false, reason: 'Not enough crystals to refresh' };
  }
  return {
    ok: true,
    profile: {
      ...profile,
      gems: profile.gems - cost,
      combatShopRerolls: profile.combatShopRerolls + 1,
      // Reset the bought counts for the new roll
      combatShopBoughtCounts: {},
      combatShopBoughtIds: [],
    }
  };
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

// === Card / Equipment Upgrades (universal level system) ===
//
// Actions, Tactics, and Equipment all share the same level ladder (1..10)
// stored in profile.combatCardTiers (kept for save-compat). One upgrade =
// consume a stack of duplicate copies + a gold fee. Talents are NOT
// upgradable — they remain consumable charges in perksInventory.

/** What the player needs to spend to upgrade `cardId` from its current level. */
export interface UpgradePreview {
  level: number;
  nextLevel: number | null;        // null at MAX_CARD_LEVEL
  copies: number;                  // copies needed (Infinity if maxed)
  gold: number;                    // gold needed (Infinity if maxed)
  ownedCopies: number;
  rarity: Rarity;
  isMax: boolean;
}

function rarityForCardId(cardId: string): Rarity | null {
  const a = getAction(cardId);
  if (a) return a.rarity;
  const t = getTactic(cardId);
  if (t) return t.rarity;
  const eq = allEquipment().find(e => e.id === cardId);
  if (eq) return eq.rarity;
  return null;
}

/** Read-only view of the upgrade cost / state for a card or equipment id. */
export function combatCardUpgradePreview(profile: Profile, cardId: string): UpgradePreview | null {
  const rarity = rarityForCardId(cardId);
  if (!rarity) return null;
  const level = profile.combatCardTiers[cardId] ?? 1;
  const ownedCopies = profile.combatCardInventory[cardId] ?? 0;
  const cost = cardUpgradeCostFor(level, rarity);
  const isMax = isCardMaxLevel(level);
  return {
    level,
    nextLevel: isMax ? null : level + 1,
    copies: cost?.copies ?? Infinity,
    gold: cost?.gold ?? Infinity,
    ownedCopies,
    rarity,
    isMax,
  };
}

/**
 * Legacy-named export retained for the existing UI that imports it. Returns
 * just `{ copies, gold }` for the *next* upgrade step (or Infinity at cap).
 * Prefer combatCardUpgradePreview for new callsites.
 */
export function combatCardUpgradeCost(profile: Profile, cardId: string): { copies: number; gold: number } {
  const preview = combatCardUpgradePreview(profile, cardId);
  if (!preview) return { copies: Infinity, gold: Infinity };
  return { copies: preview.copies, gold: preview.gold };
}

export function upgradeCombatCard(profile: Profile, cardId: string): CombatBuyResult {
  const preview = combatCardUpgradePreview(profile, cardId);
  if (!preview) return { ok: false, reason: 'Unknown card' };
  if (preview.isMax) return { ok: false, reason: `Card is already at max level (${MAX_CARD_LEVEL})` };
  if (preview.ownedCopies < preview.copies) {
    return { ok: false, reason: 'Not enough duplicate copies' };
  }
  if (profile.bankCoins < preview.gold) {
    return { ok: false, reason: 'Not enough gold' };
  }

  const next: Profile = {
    ...profile,
    bankCoins: profile.bankCoins - preview.gold,
    combatCardInventory: {
      ...profile.combatCardInventory,
      [cardId]: preview.ownedCopies - preview.copies,
    },
    combatCardTiers: {
      ...profile.combatCardTiers,
      [cardId]: preview.level + 1,
    },
  };

  // If consuming copies took us below the deck count for this card, drop
  // trailing instances from the deck so ownership invariants hold. (May
  // push the deck below DECK_MIN — UI gates the next run start.)
  const newOwned = next.combatCardInventory[cardId] ?? 0;
  const inDeck = profile.combatDeck.filter(id => id === cardId).length;
  if (inDeck > newOwned) {
    let toRemove = inDeck - newOwned;
    const nextDeck = [...profile.combatDeck];
    while (toRemove > 0) {
      const idx = nextDeck.lastIndexOf(cardId);
      if (idx === -1) break;
      nextDeck.splice(idx, 1);
      toRemove--;
    }
    next.combatDeck = nextDeck;
  }

  return { ok: true, profile: next };
}

