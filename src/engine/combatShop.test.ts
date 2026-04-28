import { describe, expect, it } from 'vitest';
import { priceFor, rollCombatShop, rerollCostFor } from './combatShop';
import { getAction, getTactic } from './actionCards';

describe('combat shop pricing', () => {
  it('common Action sells for ~150g/10c', () => {
    const def = getAction('act_001')!; // Strike, common
    const p = priceFor(def);
    expect(p.gold).toBe(150);
    expect(p.crystals).toBe(10);
  });

  it('rare Action sells for 800g/60c', () => {
    const def = getAction('act_005')!; // Blade Dance, rare
    const p = priceFor(def);
    expect(p.gold).toBe(800);
    expect(p.crystals).toBe(60);
  });

  it('legendary Action sells for 5000g/400c', () => {
    const def = getAction('act_023')!; // Sigil of Ruin, legendary
    const p = priceFor(def);
    expect(p.gold).toBe(5000);
    expect(p.crystals).toBe(400);
  });

  it('Tactics sell for 70% of Action price', () => {
    const block = getTactic('tac_001')!; // common Block
    expect(priceFor(block).gold).toBe(Math.round(150 * 0.7));
    expect(priceFor(block).crystals).toBe(Math.round(10 * 0.7));
  });
});

describe('rollCombatShop determinism', () => {
  it('same dayKey + reroll count yields the same 6 cards', () => {
    const a = rollCombatShop('2026-04-28', 0);
    const b = rollCombatShop('2026-04-28', 0);
    expect(a.map(e => e.cardId)).toEqual(b.map(e => e.cardId));
  });

  it('different dayKeys produce different rolls', () => {
    const day1 = rollCombatShop('2026-04-28', 0).map(e => e.cardId).join(',');
    const day2 = rollCombatShop('2026-04-29', 0).map(e => e.cardId).join(',');
    expect(day1).not.toBe(day2);
  });

  it('reroll bumps produce different rolls', () => {
    const r0 = rollCombatShop('2026-04-28', 0).map(e => e.cardId).join(',');
    const r1 = rollCombatShop('2026-04-28', 1).map(e => e.cardId).join(',');
    expect(r0).not.toBe(r1);
  });

  it('every entry has a valid def + nonzero price', () => {
    const entries = rollCombatShop('2026-04-28', 0);
    expect(entries.length).toBe(6);
    for (const e of entries) {
      expect(e.def).toBeDefined();
      expect(e.goldPrice).toBeGreaterThan(0);
      expect(e.crystalPrice).toBeGreaterThan(0);
      expect(['action', 'tactic']).toContain(e.kind);
    }
  });

  it('rolls a mix of Action and Tactic across 50 days', () => {
    let actionCount = 0, tacticCount = 0;
    for (let i = 0; i < 50; i++) {
      const entries = rollCombatShop(`2026-day-${i}`, 0);
      for (const e of entries) {
        if (e.kind === 'action') actionCount++;
        else tacticCount++;
      }
    }
    expect(actionCount).toBeGreaterThan(0);
    expect(tacticCount).toBeGreaterThan(0);
    // Bias should favour actions (~70%).
    expect(actionCount).toBeGreaterThan(tacticCount);
  });
});

describe('rerollCostFor', () => {
  it('escalates with each reroll', () => {
    expect(rerollCostFor(0)).toBe(10);
    expect(rerollCostFor(1)).toBe(25);
    expect(rerollCostFor(2)).toBe(50);
    expect(rerollCostFor(3)).toBe(100);
    expect(rerollCostFor(4)).toBe(200);
  });

  it('caps at the last ladder value', () => {
    expect(rerollCostFor(99)).toBe(200);
  });
});
