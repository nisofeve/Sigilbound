import { describe, expect, it } from 'vitest';
import { newCombatant, baseStatsForLevel, type PlayerCombatant } from './player';
import {
  REACTION_LIBRARY,
  emptyReactions,
  fireReactions,
  type ActiveReactions,
  type ReactionContext,
} from './reactions';

const player: PlayerCombatant = newCombatant(baseStatsForLevel(1));

function ctx(trigger: ReactionContext['trigger'], over: Partial<ReactionContext> = {}): ReactionContext {
  return { trigger, player, enemies: [], ...over };
}

describe('REACTION_LIBRARY', () => {
  it('exposes the 10 GDD reactions', () => {
    const ids = Object.keys(REACTION_LIBRARY);
    expect(ids).toContain('parry');
    expect(ids).toContain('dodge');
    expect(ids).toContain('counterstrike');
    expect(ids).toContain('bloodthirst');
    expect(ids).toContain('power_surge');
    expect(ids).toContain('sigil_echo');
    expect(ids).toContain('last_stand');
    expect(ids).toContain('phoenix_heart');
    expect(ids).toContain('soulbond');
    expect(ids).toContain('sigilbinders_will');
  });

  it('every reaction has trigger + apply fn', () => {
    for (const def of Object.values(REACTION_LIBRARY)) {
      expect(typeof def.trigger).toBe('string');
      expect(typeof def.apply).toBe('function');
    }
  });
});

describe('fireReactions — filtering', () => {
  it('only fires reactions whose trigger matches', () => {
    const state: ActiveReactions = { active: ['parry', 'bloodthirst'], consumed: [] };
    const r = fireReactions(state, ctx('onAttackIncoming', { damage: 10 }));
    expect(r.firedIds).toEqual(['parry']);
    expect(r.state.active).toEqual(['bloodthirst']);
  });

  it('skips reactions whose predicate returns false', () => {
    // last_stand requires HP < 25%; default player is full HP
    const state: ActiveReactions = { active: ['last_stand'], consumed: [] };
    const r = fireReactions(state, ctx('onLowHp'));
    expect(r.firedIds).toEqual([]);
  });

  it('fires reactions whose predicate is satisfied', () => {
    const lowPlayer: PlayerCombatant = { ...player, currentHp: 5 }; // 10% HP
    const state: ActiveReactions = { active: ['last_stand'], consumed: [] };
    const r = fireReactions(state, { trigger: 'onLowHp', player: lowPlayer, enemies: [] });
    expect(r.firedIds).toEqual(['last_stand']);
    expect(r.patch.damageBuffPct).toBe(0.5);
  });

  it('returns an unchanged state when nothing fires', () => {
    const state: ActiveReactions = { active: ['parry'], consumed: ['dodge'] };
    const r = fireReactions(state, ctx('onKill'));
    expect(r.firedIds).toEqual([]);
    expect(r.state).toEqual(state);
  });
});

describe('fireReactions — consumption rules', () => {
  it('non-persistent reactions are consumed when fired', () => {
    const state: ActiveReactions = { active: ['bloodthirst'], consumed: [] };
    const r = fireReactions(state, ctx('onKill'));
    expect(r.state.active).toEqual([]);
    expect(r.state.consumed).toContain('bloodthirst');
  });

  it('persistent reactions stay in active list', () => {
    const lowPlayer: PlayerCombatant = { ...player, currentHp: 1 };
    const state: ActiveReactions = { active: ['last_stand'], consumed: [] };
    const r = fireReactions(state, { trigger: 'onLowHp', player: lowPlayer, enemies: [] });
    expect(r.state.active).toEqual(['last_stand']);
    expect(r.state.consumed).toEqual([]);
  });

  it('mixed active list: some consumed, some persistent', () => {
    const lowPlayer: PlayerCombatant = { ...player, currentHp: 1 };
    const state: ActiveReactions = { active: ['last_stand', 'phoenix_heart'], consumed: [] };
    const r = fireReactions(state, { trigger: 'onLowHp', player: lowPlayer, enemies: [] });
    // last_stand fires + persists; phoenix_heart has different trigger and doesn't fire
    expect(r.firedIds).toEqual(['last_stand']);
    expect(r.state.active).toContain('last_stand');
    expect(r.state.active).toContain('phoenix_heart');
  });

  it('phoenix_heart fires on lethal and is one-shot', () => {
    const state: ActiveReactions = { active: ['phoenix_heart'], consumed: [] };
    const r = fireReactions(state, ctx('onLethal'));
    expect(r.firedIds).toEqual(['phoenix_heart']);
    expect(r.patch.surviveAtHp).toBe(1);
    expect(r.state.active).toEqual([]);
  });
});

describe('fireReactions — patch merging', () => {
  it('merges flat numeric fields by sum', () => {
    // Stack two healing reactions (using bloodthirst twice as a hypothetical)
    const state: ActiveReactions = { active: ['bloodthirst', 'bloodthirst'], consumed: [] };
    const r = fireReactions(state, ctx('onKill'));
    expect(r.patch.healPlayer).toBe(6); // 3 + 3
  });

  it('reduceIncomingDamagePct stacks multiplicatively', () => {
    // Dodge twice: 0.5 + 0.5 → 1 - (1-0.5)*(1-0.5) = 0.75 remaining reduction
    const state: ActiveReactions = { active: ['dodge', 'dodge'], consumed: [] };
    const r = fireReactions(state, ctx('onAttackIncoming', { damage: 10 }));
    expect(r.patch.reduceIncomingDamagePct).toBeCloseTo(0.75);
  });

  it('priority order: parry (0) before dodge (1)', () => {
    const state: ActiveReactions = { active: ['dodge', 'parry'], consumed: [] };
    const r = fireReactions(state, ctx('onAttackIncoming', { damage: 10 }));
    expect(r.firedIds).toEqual(['parry', 'dodge']); // sorted by priority
  });

  it('logs concatenate', () => {
    const state: ActiveReactions = { active: ['parry', 'dodge'], consumed: [] };
    const r = fireReactions(state, ctx('onAttackIncoming', { damage: 6 }));
    expect(r.patch.log).toMatch(/Parry/);
    expect(r.patch.log).toMatch(/Dodge/);
  });
});

describe('Specific reaction effects', () => {
  it('parry negates up to 6 dmg', () => {
    const state: ActiveReactions = { active: ['parry'], consumed: [] };
    const r1 = fireReactions(state, ctx('onAttackIncoming', { damage: 4 }));
    expect(r1.patch.reduceIncomingDamageBy).toBe(4);
    const r2 = fireReactions(state, ctx('onAttackIncoming', { damage: 20 }));
    expect(r2.patch.reduceIncomingDamageBy).toBe(6);
  });

  it("Sigilbinder's Will fires on stage start, draws 1 + gives 4 block", () => {
    const state: ActiveReactions = { active: ['sigilbinders_will'], consumed: [] };
    const r = fireReactions(state, ctx('onStageStart'));
    expect(r.patch.drawCards).toBe(1);
    expect(r.patch.giveBlock).toBe(4);
  });

  it('emptyReactions yields a fresh slot', () => {
    const e = emptyReactions();
    expect(e.active).toEqual([]);
    expect(e.consumed).toEqual([]);
  });
});
