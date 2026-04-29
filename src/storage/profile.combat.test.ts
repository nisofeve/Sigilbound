// Tests for applyCombatClearToProfile — combat stage clears + reward grants.
//
// Uses real getStage() definitions so the reward math reflects what the
// game actually serves to players. Profile mutations go through the same
// path as the production app (saveProfile is called inside the helper),
// but localStorage is stubbed via vitest's globals.

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { applyCombatClearToProfile } from './profile';
import { getStage } from '../engine/stageDef';
import type { Profile } from './types';

// Minimal profile factory — only the fields applyCombatClearToProfile reads
// or writes. Other fields default to whatever Profile demands.
function makeProfile(over: Partial<Profile> = {}): Profile {
  return {
    bankCoins: 0,
    totalCoinsEarned: 0,
    gems: 0,
    perkShards: 0,
    playerXp: 0,
    currentStage: 1,
    stageStars: {},
    stageRewardsClaimed: {},
    // Catch-all for everything else — cast through unknown so TS doesn't
    // demand the full schema for tests that only touch a slice.
    ...(over as Partial<Profile>),
  } as Profile;
}

beforeEach(() => {
  // Stub localStorage so saveProfile() inside the helper doesn't blow up
  // in node. The shape of the data isn't important for these tests.
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

describe('applyCombatClearToProfile', () => {
  it('defeat: returns 0 stars and does not mutate profile', () => {
    const stage = getStage(3);
    const before = makeProfile({ bankCoins: 100, currentStage: 3 });
    const { profile, outcome } = applyCombatClearToProfile(before, stage, {
      cleared: false, currentHp: 0, maxHp: 50,
    });
    expect(outcome.stars).toBe(0);
    expect(outcome.firstClearAtTier).toBe(0);
    expect(outcome.rewardsGranted).toEqual([]);
    expect(profile).toBe(before); // identity preserved on no-op
  });

  it('first clear at 3 stars: full chest, currentStage advances, claimed marker set', () => {
    const stage = getStage(3);
    const before = makeProfile({ bankCoins: 0, playerXp: 0, currentStage: 3 });
    const { profile, outcome } = applyCombatClearToProfile(before, stage, {
      cleared: true, currentHp: 50, maxHp: 50,
    });
    expect(outcome.stars).toBe(3);
    expect(outcome.firstClearAtTier).toBe(3);
    expect(outcome.rewardsGranted.length).toBeGreaterThan(0);
    expect(profile.bankCoins).toBeGreaterThan(0);
    expect(profile.playerXp).toBeGreaterThan(0);
    expect(profile.currentStage).toBe(4);
    expect(profile.stageStars[3]).toBe(3);
    expect(profile.stageRewardsClaimed[3]).toBe(3);
  });

  it('replay at same star tier: pays smaller replay reward, no new first-clear', () => {
    const stage = getStage(3);
    let p = makeProfile({ currentStage: 4 });
    // First clear at 3 stars to set the claimed marker.
    p = applyCombatClearToProfile(p, stage, { cleared: true, currentHp: 50, maxHp: 50 }).profile;
    const coinsAfterFirst = p.bankCoins;

    // Replay at 3 stars again.
    const { profile, outcome } = applyCombatClearToProfile(p, stage, {
      cleared: true, currentHp: 50, maxHp: 50,
    });
    expect(outcome.firstClearAtTier).toBe(0);          // no new first-clear
    expect(outcome.rewardsGranted.length).toBeGreaterThan(0);
    // Replay should add some coins but less than the first-clear chest did.
    const replayDelta = profile.bankCoins - coinsAfterFirst;
    expect(replayDelta).toBeGreaterThan(0);
    expect(replayDelta).toBeLessThan(coinsAfterFirst);
  });

  it('upgrading from 1 star to 3 stars: pays the 3-star first-clear chest', () => {
    const stage = getStage(3);
    let p = makeProfile({ currentStage: 3 });
    // First clear at 1 star.
    p = applyCombatClearToProfile(p, stage, { cleared: true, currentHp: 5, maxHp: 50 }).profile;
    expect(p.stageRewardsClaimed[3]).toBe(1);
    const coinsAfter1Star = p.bankCoins;

    // Re-clear at 3 stars — should now pay the upgraded first-clear chest.
    const { profile, outcome } = applyCombatClearToProfile(p, stage, {
      cleared: true, currentHp: 50, maxHp: 50,
    });
    expect(outcome.stars).toBe(3);
    expect(outcome.firstClearAtTier).toBe(3);
    expect(profile.stageRewardsClaimed[3]).toBe(3);
    // The 3-star chest is meaningfully bigger than the 1-star.
    expect(profile.bankCoins - coinsAfter1Star).toBeGreaterThan(coinsAfter1Star);
  });

  it('boss clear pays gems', () => {
    const boss = getStage(5);
    const before = makeProfile({ gems: 0, currentStage: 5 });
    const { profile, outcome } = applyCombatClearToProfile(before, boss, {
      cleared: true, currentHp: 50, maxHp: 50,
    });
    expect(outcome.rewardsGranted.find(r => r.type === 'gems')).toBeDefined();
    expect(profile.gems).toBeGreaterThan(0);
  });
});
