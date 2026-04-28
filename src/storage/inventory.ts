// Card inventory + deck preset helpers. Pure functions over Profile — no
// localStorage I/O here, callers are expected to thread the returned
// Profile back through saveProfile (the public-facing wrappers in the
// barrel do this for backward compatibility).

import type { CardId, Grade } from '@engine/index';
import { getCard, nextGrade, upgradeCost } from '@engine/index';
import { saveProfile } from './profile';
import type { DeckEntry, DeckPreset, Profile } from './types';

export function inventoryCount(profile: Profile, cardId: CardId, grade: Grade): number {
  return profile.cardInventory[cardId]?.[grade] ?? 0;
}

// Deep-clones the inventory map and adjusts a single id+grade by delta.
// Returns null if the result would go negative.
export function adjustInventory(
  inv: Profile['cardInventory'],
  cardId: CardId,
  grade: Grade,
  delta: number,
): Profile['cardInventory'] | null {
  const next: Profile['cardInventory'] = { ...inv, [cardId]: { ...(inv[cardId] ?? {}) } };
  const cur = next[cardId]![grade] ?? 0;
  const after = cur + delta;
  if (after < 0) return null;
  if (after === 0) {
    delete next[cardId]![grade];
    if (Object.keys(next[cardId]!).length === 0) delete next[cardId];
  } else {
    next[cardId]![grade] = after;
  }
  return next;
}

// Total count of a card+grade across all 5 deck presets — needed to validate
// that the player has enough copies to upgrade (presets must release any
// copies they're using before the upgrade can sacrifice them).
export function inventoryAvailable(profile: Profile, cardId: CardId, grade: Grade): number {
  return inventoryCount(profile, cardId, grade);
}

// Try to upgrade one copy of `cardId` from `fromGrade` to the next grade up.
// Returns the next profile (saved) on success, or null if the player can't
// afford it / is at A already / card has no rarity (e.g., bad id).
export function upgradeCardInProfile(
  profile: Profile,
  cardId: CardId,
  fromGrade: Grade,
): Profile | null {
  const card = (() => { try { return getCard(cardId); } catch { return null; } })();
  if (!card) return null;
  const toGrade = nextGrade(fromGrade);
  if (!toGrade) return null;
  const cost = upgradeCost(card.rarity, fromGrade);
  if (!cost) return null;

  const haveDupes = inventoryCount(profile, cardId, fromGrade);
  // Need cost.duplicates dupes PLUS the one being upgraded itself.
  const totalNeeded = cost.duplicates + 1;
  if (haveDupes < totalNeeded) return null;
  if (profile.bankCoins < cost.coins) return null;

  // Sacrifice dupes + 1 (the upgraded copy moves up a grade).
  const removed = adjustInventory(profile.cardInventory, cardId, fromGrade, -totalNeeded);
  if (!removed) return null;
  const added = adjustInventory(removed, cardId, toGrade, 1);
  if (!added) return null;

  const next: Profile = {
    ...profile,
    cardInventory: added,
    bankCoins: profile.bankCoins - cost.coins,
  };
  saveProfile(next);
  return next;
}

// Add `count` copies of cardId+grade to the player's inventory (used by
// shop purchase + run-rewards plumbing).
export function addCardToInventory(
  profile: Profile,
  cardId: CardId,
  grade: Grade,
  count = 1,
): Profile {
  const next = adjustInventory(profile.cardInventory, cardId, grade, count);
  if (!next) return profile;
  const out: Profile = { ...profile, cardInventory: next };
  saveProfile(out);
  return out;
}

// Replace one of the player's deck presets with new entries. Validates that
// the entries don't exceed inventory: each entry's count must be <= what the
// player owns at that id+grade. (Multiple presets CAN reference the same
// inventory copies — presets are just templates, not consumption.)
export function setDeckPreset(
  profile: Profile,
  presetIndex: number,
  preset: DeckPreset,
): Profile {
  if (presetIndex < 0 || presetIndex >= profile.deckPresets.length) return profile;
  const valid: DeckEntry[] = [];
  for (const entry of preset.entries) {
    const own = inventoryCount(profile, entry.cardId, entry.grade);
    const cap = Math.min(entry.count, own);
    if (cap > 0) valid.push({ cardId: entry.cardId, grade: entry.grade, count: cap });
  }
  const decks = profile.deckPresets.slice();
  decks[presetIndex] = { name: preset.name, entries: valid };
  const next: Profile = { ...profile, deckPresets: decks };
  saveProfile(next);
  return next;
}

export function setActiveDeckPreset(profile: Profile, idx: number): Profile {
  if (idx < 0 || idx >= profile.deckPresets.length) return profile;
  const next: Profile = { ...profile, activeDeckPreset: idx };
  saveProfile(next);
  return next;
}

// Flatten a deck preset into the parallel (cardId, grade) arrays the engine
// expects. Caller passes the result into defaultSeasonConfig as overrides.
export function presetToStartingDeck(preset: DeckPreset): { cards: CardId[]; grades: Grade[] } {
  const cards: CardId[] = [];
  const grades: Grade[] = [];
  for (const entry of preset.entries) {
    for (let i = 0; i < entry.count; i++) {
      cards.push(entry.cardId);
      grades.push(entry.grade);
    }
  }
  return { cards, grades };
}

// Counts the actual number of cards in a preset (sum of counts).
export function countDeckEntries(preset: DeckPreset): number {
  return preset.entries.reduce((n, e) => n + e.count, 0);
}
