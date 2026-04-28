// Daily shop helpers — rollover, reroll, and buy-card / buy-perk handlers.
// Operates on the shared Profile shape via the core save helper.

import { adjustInventory } from './inventory';
import { saveProfile } from './profile';
import { addPerkCharges } from './perks';
import type { BuyDailyOptions, BuyDailyPerkOptions, Profile } from './types';

// Reset the per-day "bought" tracker if the date has rolled over. Returns the
// possibly-updated profile.
export function rolloverDailyShop(profile: Profile, todayISO: string): Profile {
  if (profile.dailyShopISO === todayISO) return profile;
  const next: Profile = {
    ...profile,
    dailyShopISO: todayISO,
    dailyShopBoughtIds: [],
    // Both reroll counters reset at midnight UTC alongside bought-ids so
    // tomorrow's first reroll is back at the cheapest tier.
    dailyShopRerolls: 0,
    dailyPerkShopRerolls: 0,
  };
  saveProfile(next);
  return next;
}

// Reroll one of the two daily shop tabs. Charges a fee that escalates with
// the day's previous rerolls (see rerollCoinCostFor / rerollGemCostFor in
// the engine), bumps the corresponding counter, and clears the bought-ids
// belonging to the reroll-target shop so the new slots are buyable.
// Returns null on insufficient funds; the new profile otherwise.
export function rerollDailyShop(
  profile: Profile,
  shop: 'cards' | 'perks',
  payWith: 'coins' | 'gems',
  costs: { coin: number; gem: number },
): Profile | null {
  if (payWith === 'coins' && profile.bankCoins < costs.coin) return null;
  if (payWith === 'gems' && profile.gems < costs.gem) return null;
  // Drop only the bought ids that belong to the shop being rerolled. Slot
  // ids start with "daily." for cards and "dailyperk." for perks, so we
  // can split the list cleanly.
  const prefix = shop === 'cards' ? 'daily.' : 'dailyperk.';
  const remainingBought = profile.dailyShopBoughtIds.filter(id => !id.startsWith(prefix));
  const next: Profile = {
    ...profile,
    bankCoins: payWith === 'coins' ? profile.bankCoins - costs.coin : profile.bankCoins,
    gems: payWith === 'gems' ? profile.gems - costs.gem : profile.gems,
    dailyShopBoughtIds: remainingBought,
    dailyShopRerolls: shop === 'cards' ? profile.dailyShopRerolls + 1 : profile.dailyShopRerolls,
    dailyPerkShopRerolls: shop === 'perks' ? profile.dailyPerkShopRerolls + 1 : profile.dailyPerkShopRerolls,
  };
  saveProfile(next);
  return next;
}

// Buy a daily-shop entry. Adds 1 F-grade copy of the card to inventory and
// marks the slot as bought (one purchase per slot per day). Returns null on
// insufficient funds / already-bought.
export function buyDailyCard(profile: Profile, opts: BuyDailyOptions): Profile | null {
  if (profile.dailyShopBoughtIds.includes(opts.entryId)) return null;
  if (opts.payWith === 'coins' && profile.bankCoins < opts.coinPrice) return null;
  if (opts.payWith === 'gems' && profile.gems < opts.gemPrice) return null;
  const inv = adjustInventory(profile.cardInventory, opts.cardId, 'F', 1);
  if (!inv) return null;
  const next: Profile = {
    ...profile,
    cardInventory: inv,
    bankCoins: opts.payWith === 'coins' ? profile.bankCoins - opts.coinPrice : profile.bankCoins,
    gems: opts.payWith === 'gems' ? profile.gems - opts.gemPrice : profile.gems,
    dailyShopBoughtIds: [...profile.dailyShopBoughtIds, opts.entryId],
  };
  saveProfile(next);
  return next;
}

// Buy a daily-perk-shop entry. Adds 1 charge of the perk to inventory and
// marks the slot as bought (one purchase per slot per day).
export function buyDailyPerk(profile: Profile, opts: BuyDailyPerkOptions): Profile | null {
  if (profile.dailyShopBoughtIds.includes(opts.entryId)) return null;
  if (opts.payWith === 'coins') {
    if (opts.coinPrice === null) return null;
    if (profile.bankCoins < opts.coinPrice) return null;
  }
  if (opts.payWith === 'gems' && profile.gems < opts.gemPrice) return null;
  let next = addPerkCharges(profile, opts.perkId, 1);
  next = {
    ...next,
    bankCoins: opts.payWith === 'coins' ? next.bankCoins - (opts.coinPrice ?? 0) : next.bankCoins,
    gems: opts.payWith === 'gems' ? next.gems - opts.gemPrice : next.gems,
    dailyShopBoughtIds: [...next.dailyShopBoughtIds, opts.entryId],
  };
  saveProfile(next);
  return next;
}
