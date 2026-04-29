import { describe, expect, it } from 'vitest';
import {
  abundanceMultiplier,
  gardenVarietyBonus,
  loyalMultiplier,
  onslaughtMultiplier,
  relentlessMultiplier,
  resolveHarvests,
  triadicStrikeBonus,
} from './combos';

const noPerks = { perks: [] };

describe('Combo 1 — Onslaught (Sigilbound: same-type stacking)', () => {
  it('matches the new aggressive tier table', () => {
    expect(onslaughtMultiplier(1)).toBe(1);
    expect(onslaughtMultiplier(2)).toBeCloseTo(1.25);
    expect(onslaughtMultiplier(3)).toBeCloseTo(1.50);
    expect(onslaughtMultiplier(4)).toBeCloseTo(1.85);
    expect(onslaughtMultiplier(5)).toBeCloseTo(2.30);
    expect(onslaughtMultiplier(6)).toBeCloseTo(3.00);
    expect(onslaughtMultiplier(10)).toBeCloseTo(3.00);
  });

  it('Onslaught Amplifier talent bumps each tier one higher', () => {
    expect(onslaughtMultiplier(2, 1)).toBeCloseTo(1.50); // 2-stack uses 3-stack tier
    expect(onslaughtMultiplier(3, 1)).toBeCloseTo(1.85);
    expect(onslaughtMultiplier(4, 1)).toBeCloseTo(2.30);
    expect(onslaughtMultiplier(5, 1)).toBeCloseTo(3.00);
  });

  it('back-compat: deprecated abundanceMultiplier alias still works', () => {
    expect(abundanceMultiplier).toBe(onslaughtMultiplier);
    expect(abundanceMultiplier(3)).toBeCloseTo(1.50);
  });
});

describe('Combo 2 — Triadic Strike (Sigilbound: distinct-type bonus)', () => {
  it('+30 flat on 3+ distinct types, else 0', () => {
    expect(triadicStrikeBonus(1)).toBe(0);
    expect(triadicStrikeBonus(2)).toBe(0);
    expect(triadicStrikeBonus(3)).toBe(30);
    expect(triadicStrikeBonus(4)).toBe(30);
  });

  it('back-compat: deprecated gardenVarietyBonus alias still works', () => {
    expect(gardenVarietyBonus).toBe(triadicStrikeBonus);
    expect(gardenVarietyBonus(3)).toBe(30);
  });
});

describe('Combo 3 — Relentless (Sigilbound: streak commitment)', () => {
  it('+15% per stack, capped at +90% (6 stacks)', () => {
    expect(relentlessMultiplier(0)).toBeCloseTo(1.0);
    expect(relentlessMultiplier(1)).toBeCloseTo(1.15);
    expect(relentlessMultiplier(2)).toBeCloseTo(1.30);
    expect(relentlessMultiplier(5)).toBeCloseTo(1.75);
    expect(relentlessMultiplier(6)).toBeCloseTo(1.90);
    expect(relentlessMultiplier(10)).toBeCloseTo(1.90);
  });

  it('Loyalty Pact talent raises cap by capDelta stacks', () => {
    // capDelta = 2 → max stacks 6 + 2 = 8 → +120%
    expect(relentlessMultiplier(8, 2)).toBeCloseTo(2.20);
    expect(relentlessMultiplier(10, 2)).toBeCloseTo(2.20); // still capped at 8
  });

  it('back-compat: deprecated loyalMultiplier alias still works', () => {
    expect(loyalMultiplier).toBe(relentlessMultiplier);
    expect(loyalMultiplier(3)).toBeCloseTo(1.45);
  });
});

describe('Worked example — Onslaught + Relentless stacking', () => {
  it('5-stack with prior streak of 2 → onslaught 2.3 × relentless 1.3 ≈ 3.0× per strike', () => {
    const harvested = Array.from({ length: 5 }, () => ({ crop: 'carrot' as const, basePrice: 8 }));
    const result = resolveHarvests(harvested, {
      ...noPerks,
      relentlessStreakBefore: 2,
      relentlessCropBefore: 'carrot',
      round: 6,
    });

    expect(result.harvests).toHaveLength(5);
    for (const h of result.harvests) {
      expect(h.onslaughtMult).toBeCloseTo(2.30);
      expect(h.relentlessMult).toBeCloseTo(1.30);
      // 8 * 2.30 * 1.30 = 23.92 → rounds to 24
      expect(h.finalPrice).toBe(24);
    }
    expect(result.triadicBonus).toBe(0);
    expect(result.totalCoinsThisRound).toBe(120);
    expect(result.combosTriggered.onslaught).toBe(true);
    expect(result.combosTriggered.relentless).toBe(true);
    expect(result.combosTriggered.triadic).toBe(false);
    expect(result.relentlessStreakAfter).toBe(3);
  });

  it('Variety path: 1 of each of 3 types → +30 flat, no onslaught, relentless resets', () => {
    const harvested = [
      { crop: 'carrot' as const, basePrice: 8 },
      { crop: 'corn' as const, basePrice: 15 },
      { crop: 'tomato' as const, basePrice: 28 },
    ];
    const result = resolveHarvests(harvested, {
      ...noPerks,
      relentlessStreakBefore: 3,
      relentlessCropBefore: 'carrot',
      round: 6,
    });

    expect(result.triadicBonus).toBe(30);
    expect(result.harvests.every(h => h.onslaughtMult === 1)).toBe(true);
    expect(result.harvests.every(h => h.relentlessMult === 1)).toBe(true);
    expect(result.totalCoinsThisRound).toBe(8 + 15 + 28 + 30);
    expect(result.combosTriggered.triadic).toBe(true);
    expect(result.combosTriggered.onslaught).toBe(false);
    expect(result.relentlessStreakAfter).toBe(0);
  });
});

describe('Perk + event modifiers', () => {
  it('Tycoon Touch perk applies +10% to all sales', () => {
    const result = resolveHarvests([{ crop: 'carrot', basePrice: 10 }], {
      perks: [
        { id: 't', name: 'Tycoon', rarity: 'rare', kind: 'passive', icon: '💰', description: '', modifier: { type: 'global_sale_mult', value: 0.1 } },
      ],
      relentlessStreakBefore: 0,
      relentlessCropBefore: null,
      round: 1,
    });
    expect(result.harvests[0].finalPrice).toBe(11); // 10 * 1.1
  });

  it('Harvest Festival event multiplies round earnings', () => {
    const result = resolveHarvests([{ crop: 'corn', basePrice: 20 }], {
      perks: [],
      relentlessStreakBefore: 0,
      relentlessCropBefore: null,
      round: 5,
      roundSaleMultBonus: 0.25,
    });
    expect(result.harvests[0].finalPrice).toBe(25); // 20 * 1.25
  });
});
