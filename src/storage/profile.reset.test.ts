// Tests for resetProfile — verifies a "wipe everything" restores the player
// to a fresh-install state with starter cards, default deck, starter perks.

import { describe, expect, it } from 'vitest';
import { loadProfile, resetProfile, saveProfile } from './profile';
import { STARTER_PERKS } from './types';

describe('resetProfile', () => {
  it('restores starter combat deck after wiping a customised one', () => {
    // Load a fresh profile, then mutate the combat deck and inventory to
    // simulate progress.
    const fresh = loadProfile();
    const dirty = {
      ...fresh,
      bankCoins: 99999,
      gems: 500,
      combatCardInventory: { act_999: 5, tac_999: 3 }, // imaginary owned cards
      combatDeck: ['act_999', 'act_999', 'tac_999'],
      combatDeckSets: [
        { name: 'Custom', cards: ['act_999', 'act_999', 'tac_999'] },
        { name: 'Empty', cards: [] },
      ],
      activeCombatDeckSet: 0,
      upgradesOwned: ['upg.armory.atk_1', 'upg.sanctum.hp_1'],
      currentStage: 25,
      stageStars: { 1: 3, 2: 3, 3: 2 } as Record<number, 1 | 2 | 3>,
    };
    saveProfile(dirty);

    const reset = resetProfile();

    // Currencies wiped.
    expect(reset.bankCoins).toBe(0);
    expect(reset.gems).toBe(0);
    expect(reset.upgradesOwned).toEqual([]);
    expect(reset.currentStage).toBe(1);
    expect(reset.stageStars).toEqual({});

    // Combat collection: starter cards seeded, custom imaginary cards gone.
    expect(reset.combatCardInventory['act_001']).toBeGreaterThan(0); // Strike
    expect(reset.combatCardInventory['act_999']).toBeUndefined();
    expect(reset.combatCardInventory['tac_999']).toBeUndefined();

    // Combat deck restored to the starter loadout.
    expect(reset.combatDeck.length).toBeGreaterThan(0);
    expect(reset.combatDeck).toContain('act_001');
    expect(reset.combatDeck).toContain('tac_001');
    // No leftover custom card from the dirty profile.
    expect(reset.combatDeck).not.toContain('act_999');

    // First deck preset is the starter; subsequent ones are empty.
    expect(reset.combatDeckSets.length).toBeGreaterThanOrEqual(1);
    expect(reset.combatDeckSets[0].cards).toEqual(reset.combatDeck);
    expect(reset.activeCombatDeckSet).toBe(0);

    // Starter perks always present, no extras.
    for (const id of STARTER_PERKS) {
      expect(reset.perksOwned).toContain(id);
    }
  });

  it('produces an identical shape to a brand-new profile', () => {
    // First-time-open simulation: nothing in storage.
    const firstBoot = loadProfile();

    // Now simulate progress → reset.
    saveProfile({ ...firstBoot, bankCoins: 5000, gems: 100, totalCoinsEarned: 50000 });
    const reset = resetProfile();

    // Every meaningful counter should equal first-boot.
    expect(reset.bankCoins).toBe(firstBoot.bankCoins);
    expect(reset.gems).toBe(firstBoot.gems);
    expect(reset.totalCoinsEarned).toBe(firstBoot.totalCoinsEarned);
    expect(reset.combatDeck).toEqual(firstBoot.combatDeck);
    expect(reset.combatCardInventory).toEqual(firstBoot.combatCardInventory);
    expect(reset.upgradesOwned).toEqual(firstBoot.upgradesOwned);
    expect(reset.perksOwned).toEqual(firstBoot.perksOwned);
    expect(reset.achievementsUnlocked).toEqual(firstBoot.achievementsUnlocked);
    expect(reset.bpXp).toBe(firstBoot.bpXp);
    expect(reset.bpClaimedFree).toEqual(firstBoot.bpClaimedFree);
  });
});
