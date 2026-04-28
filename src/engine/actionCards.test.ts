import { describe, expect, it } from 'vitest';
import {
  actionInstanceFor,
  allActions,
  allReactionCards,
  allTactics,
  getAction,
  getReactionCard,
  getTactic,
} from './actionCards';
import { DAMAGE_TYPES } from './damage';
import { REACTION_LIBRARY } from './reactions';

describe('Action card data', () => {
  it('loads 30 actions per the GDD', () => {
    expect(allActions()).toHaveLength(30);
  });

  it('every action has a known damage type', () => {
    for (const a of allActions()) {
      expect(DAMAGE_TYPES).toContain(a.damageType);
    }
  });

  it('every action has charge >= 0 and damage >= 0', () => {
    for (const a of allActions()) {
      expect(a.charge).toBeGreaterThanOrEqual(0);
      expect(a.damage).toBeGreaterThanOrEqual(0);
    }
  });

  it('action ids are unique', () => {
    const ids = allActions().map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('coverage: each damage type has at least one common-rarity action', () => {
    for (const t of DAMAGE_TYPES) {
      const hasCommon = allActions().some(a => a.damageType === t && a.rarity === 'common');
      expect(hasCommon).toBe(true);
    }
  });

  it('getAction returns def by id', () => {
    expect(getAction('act_001')?.name).toBe('Strike');
    expect(getAction('nope')).toBeUndefined();
  });

  it('actionInstanceFor produces a usable ActionInstance', () => {
    const def = getAction('act_011')!;  // Firebolt
    const inst = actionInstanceFor(def, 'enemy_x');
    expect(inst.cardId).toBe('act_011');
    expect(inst.damage).toBe(5);
    expect(inst.damageType).toBe('pyre');
    expect(inst.charge).toBe(1);
    expect(inst.targetEnemyId).toBe('enemy_x');
  });
});

describe('Tactic card data', () => {
  it('loads 20 tactics per the GDD', () => {
    expect(allTactics()).toHaveLength(20);
  });

  it('tactic ids are unique', () => {
    const ids = allTactics().map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every tactic has an effect with a known kind', () => {
    const kinds = new Set([
      'block', 'heal', 'draw', 'gain_stamina', 'damage_buff', 'enemy_damage_debuff',
      'apply_status_self', 'apply_status_all_enemies', 'sigil_advance',
      'sigil_clear_redraw', 'extra_sigil_temp', 'duplicate_top_discard_action',
      'instant_resolve_one_sigil', 'reveal_intents_all', 'tutor_pick_one',
      'extra_turn', 'reflect_next_attack', 'all_cards_buffed_zero_cost',
    ]);
    for (const t of allTactics()) {
      expect(kinds.has(t.effect.kind)).toBe(true);
    }
  });

  it('cost is non-negative', () => {
    for (const t of allTactics()) {
      expect(t.cost).toBeGreaterThanOrEqual(0);
    }
  });

  it('getTactic returns def by id', () => {
    expect(getTactic('tac_001')?.name).toBe('Block');
    expect(getTactic('nope')).toBeUndefined();
  });
});

describe('Reaction card data', () => {
  it('loads 10 reactions per the GDD', () => {
    expect(allReactionCards()).toHaveLength(10);
  });

  it('every reaction id matches a REACTION_LIBRARY entry', () => {
    for (const r of allReactionCards()) {
      expect(REACTION_LIBRARY[r.id]).toBeDefined();
    }
  });

  it('reaction ids are unique', () => {
    const ids = allReactionCards().map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reaction trigger fields match the library', () => {
    for (const r of allReactionCards()) {
      expect(r.trigger).toBe(REACTION_LIBRARY[r.id].trigger);
    }
  });

  it('getReactionCard returns def by id', () => {
    expect(getReactionCard('parry')?.name).toBe('Parry');
    expect(getReactionCard('nope')).toBeUndefined();
  });
});
