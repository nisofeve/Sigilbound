// Daily card shop — 6 deterministic cards per UTC day. Same day → same offer
// regardless of refresh, device, or session. The shop sells F-grade copies
// only (the system is "buy commodity F-grade dupes; upgrade them yourself").

import { allSeeds, allTools, getCard } from './cards';
import { allPerks } from './perks';
import { perkCoinCost, perkCost } from './bp';
import { mulberry32 } from './rng';
import type { CardId, Rarity } from './types';

export interface DailyShopEntry {
  id: string;          // unique slot id, day-stable so the UI can dedupe across re-renders
  cardId: CardId;
  coinPrice: number;   // bank coins
  gemPrice: number;    // alt currency for impatient players
}

// Deterministic numeric seed from a YYYY-MM-DD string. Salted so the daily
// shop seed doesn't collide with other date-derived seeds elsewhere.
function dateSeed(iso: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < iso.length; i++) {
    h = Math.imul(h ^ iso.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return (h ^ 0xCAFEBABE) >>> 0;
}

const RARITY_COIN_PRICE: Record<Rarity, number> = {
  common: 50,
  uncommon: 150,
  rare: 400,
  epic: 1000,
  legendary: 2500,
  mythic: 6000,
};
const RARITY_GEM_PRICE: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 40,
  epic: 100,
  legendary: 250,
  mythic: 600,
};

// Weight pool: the daily shop is mostly commons & uncommons, with occasional
// rare/epic and very rare legendary/mythic — so a casual player sees something
// useful most days but the shop still feels rewarding when high tiers show up.
const WEIGHTS: Record<Rarity, number> = {
  common: 35,
  uncommon: 28,
  rare: 18,
  epic: 12,
  legendary: 5,
  mythic: 2,
};

function pickWeighted<T>(items: T[], weights: number[], rand: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Daily perk shop entry — same shape as the card shop but for perks.
// Lower-rarity perks expose a coin price too (so a player can stock up
// from grinding alone); epic+ are gems-only.
export interface DailyPerkShopEntry {
  id: string;
  perkId: string;
  coinPrice: number | null;
  gemPrice: number;
}

// Returns 6 perks for the given UTC date. Stable: same date → same list.
// Filters out the starter perks (the always-permanent ones a fresh account
// receives) — those should never appear in the consumable shop.
const STARTER_PERK_IDS = new Set(['perk.early_bird', 'perk.extra_draw']);

// Reroll cost ladder (in coins) for either daily shop. The price climbs so
// rerolling becomes increasingly expensive within the same day — players who
// want a specific tier should think about whether to reroll or wait for
// midnight UTC. Index 0 = 1st reroll, 1 = 2nd, etc. Anything past the
// table uses the last entry.
const REROLL_COIN_COST: number[] = [100, 250, 600, 1500];
// Gem alternative — flat-ish ladder, much cheaper but uses the premium
// currency. Lets impatient players reroll past the coin ceiling too.
const REROLL_GEM_COST: number[] = [10, 20, 40, 80];

export function rerollCoinCostFor(rerollIndex: number): number {
  // rerollIndex is the *upcoming* reroll number (0 = first reroll today).
  if (rerollIndex < 0) return REROLL_COIN_COST[0];
  if (rerollIndex >= REROLL_COIN_COST.length) return REROLL_COIN_COST[REROLL_COIN_COST.length - 1];
  return REROLL_COIN_COST[rerollIndex];
}
export function rerollGemCostFor(rerollIndex: number): number {
  if (rerollIndex < 0) return REROLL_GEM_COST[0];
  if (rerollIndex >= REROLL_GEM_COST.length) return REROLL_GEM_COST[REROLL_GEM_COST.length - 1];
  return REROLL_GEM_COST[rerollIndex];
}

export function dailyPerkShopForDate(iso: string, rerollCount = 0): DailyPerkShopEntry[] {
  // Salt the seed differently from the card shop so the two don't share
  // a sequence — otherwise the same daily-rng would advance for both.
  // Reroll count mixes into the seed so successive rerolls produce a
  // genuinely different list (and replaying with the same count regenerates
  // the SAME set so a refresh never silently rerolls).
  const seed = (dateSeed(iso) ^ 0x50ECC0FF ^ Math.imul(rerollCount + 1, 0x9e3779b1)) >>> 0;
  const rand = mulberry32(seed);
  const pool = allPerks().filter(p => !STARTER_PERK_IDS.has(p.id));
  if (pool.length === 0) return [];
  const used = new Set<string>();
  const out: DailyPerkShopEntry[] = [];
  let safety = 0;
  while (out.length < 6 && safety++ < 200) {
    const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    const rarity = pickWeighted(rarities, rarities.map(r => WEIGHTS[r]), rand);
    const candidates = pool.filter(p => !used.has(p.id) && p.rarity === rarity);
    if (candidates.length === 0) continue;
    const perk = candidates[Math.floor(rand() * candidates.length)];
    used.add(perk.id);
    out.push({
      // Encode reroll count in the slot id so a freshly-rerolled set of
      // entries doesn't inherit "already bought" flags from the previous
      // roll. After reroll the player gets brand-new buyable slots.
      id: `dailyperk.${iso}.r${rerollCount}.${out.length}`,
      perkId: perk.id,
      coinPrice: perkCoinCost(perk.rarity),
      gemPrice: perkCost(perk.rarity, 'gems'),
    });
    if (used.size >= pool.length) break; // exhausted unique perks
  }
  return out;
}

// Returns 6 cards for the given UTC date. Stable: same date → same list.
// `rerollCount` salts the seed so each reroll within the same day yields a
// distinct (but still deterministic) set of cards.
export function dailyShopForDate(iso: string, rerollCount = 0): DailyShopEntry[] {
  const seed = (dateSeed(iso) ^ Math.imul(rerollCount + 1, 0x85ebca6b)) >>> 0;
  const rand = mulberry32(seed);
  // Pool: all seeds + all tools, weighted by rarity. Tools have grade
  // 'F' too (grade is a no-op for them — but the price is still rarity-based).
  const pool: CardId[] = [
    ...allSeeds().map(s => s.id),
    ...allTools().map(t => t.id),
  ];
  const used = new Set<CardId>();
  const out: DailyShopEntry[] = [];
  let safety = 0;
  while (out.length < 6 && safety++ < 200) {
    // Pick a target rarity tier first, then pick a random card of that rarity
    // from the pool. Avoids low-count rarities being drowned out by commons.
    const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    const rarity = pickWeighted(rarities, rarities.map(r => WEIGHTS[r]), rand);
    const candidates = pool.filter(id => {
      if (used.has(id)) return false;
      try { return getCard(id).rarity === rarity; } catch { return false; }
    });
    if (candidates.length === 0) continue;
    const cardId = candidates[Math.floor(rand() * candidates.length)];
    used.add(cardId);
    out.push({
      // Reroll-aware slot id; same scheme as the perk shop.
      id: `daily.${iso}.r${rerollCount}.${out.length}`,
      cardId,
      coinPrice: RARITY_COIN_PRICE[rarity],
      gemPrice: RARITY_GEM_PRICE[rarity],
    });
  }
  return out;
}
