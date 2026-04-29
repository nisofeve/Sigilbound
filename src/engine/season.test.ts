import { describe, expect, it } from 'vitest';
import { SeasonRunner, defaultSeasonConfig } from './season';
import type { RunEvent } from './types';

function newRun(seed = 42, opts: { drafts?: boolean } = {}) {
  // Tests opt out of orders so harvest math is purely combo-driven and the
  // half-price-without-matching-order penalty doesn't randomise per seed.
  const cfg = defaultSeasonConfig(seed, { disableOrders: true });
  if (opts.drafts === false) cfg.draftRounds = [];
  const run = new SeasonRunner(cfg);
  // Discard opening events; tests construct expected state manually.
  run.consumeOpeningEvents();
  return run;
}

// Auto-skip any pending draft so end_round-driven tests don't stall.
function endRound(run: SeasonRunner) {
  const events = run.apply({ kind: 'end_round' });
  while (run.phase === 'draft') {
    run.apply({ kind: 'draft_skip' });
  }
  return events;
}

describe('SeasonRunner — initialisation', () => {
  it('starts at round 1 with a full hand and 3 empty plots', () => {
    const run = newRun();
    expect(run.state.round).toBe(1);
    expect(run.state.hand).toHaveLength(5);
    expect(run.state.plots).toHaveLength(3);
    expect(run.state.plots.every(p => p.kind === 'empty')).toBe(true);
    expect(run.state.coins).toBe(0);
    expect(run.phase).toBe('play');
  });

  it('is deterministic given the same seed', () => {
    const a = newRun(99);
    const b = newRun(99);
    expect(a.state.hand).toEqual(b.state.hand);
    expect(a.state.deck).toEqual(b.state.deck);
  });

  it('different seeds produce different opening hands', () => {
    const a = newRun(1);
    const b = newRun(2);
    expect(a.state.hand).not.toEqual(b.state.hand);
  });
});

describe('SeasonRunner — playing seeds', () => {
  it('moves a seed from hand to plot and reduces hand size', () => {
    const run = newRun();
    // Find a seed in hand to play.
    const seedHandIndex = run.state.hand.findIndex(id => id.startsWith('seed.'));
    expect(seedHandIndex).toBeGreaterThanOrEqual(0);
    const cardId = run.state.hand[seedHandIndex];
    const events = run.apply({ kind: 'play_seed', handIndex: seedHandIndex, plotIndex: 0 });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'seed_planted', cardId, plotIndex: 0 });
    expect(run.state.hand).toHaveLength(4);
    expect(run.state.plots[0].kind).toBe('growing');
  });

  it('rejects planting on a non-empty plot', () => {
    const run = newRun();
    const seedIdx = run.state.hand.findIndex(id => id.startsWith('seed.'));
    run.apply({ kind: 'play_seed', handIndex: seedIdx, plotIndex: 0 });
    const before = JSON.stringify(run.state.hand);
    const otherSeed = run.state.hand.findIndex(id => id.startsWith('seed.'));
    if (otherSeed >= 0) {
      const events = run.apply({ kind: 'play_seed', handIndex: otherSeed, plotIndex: 0 });
      expect(events).toEqual([]);
    }
    expect(JSON.stringify(run.state.hand)).toBe(before);
  });

  it('rejects playing a tool with the play_seed action', () => {
    const run = newRun();
    const toolIdx = run.state.hand.findIndex(id => id.startsWith('tool.'));
    if (toolIdx < 0) return; // some seeds don't deal a tool — skip
    const events = run.apply({ kind: 'play_seed', handIndex: toolIdx, plotIndex: 0 });
    expect(events).toEqual([]);
    expect(run.state.plots[0].kind).toBe('empty');
  });
});

describe('SeasonRunner — end of round mechanics', () => {
  it('grows planted seeds and harvests when ready', () => {
    const run = newRun(42, { drafts: false });
    // Plant a Humble Carrot (1 round grow) on plot 0.
    const idx = run.state.hand.findIndex(id => id === 'seed.humble_carrot');
    expect(idx).toBeGreaterThanOrEqual(0);
    run.apply({ kind: 'play_seed', handIndex: idx, plotIndex: 0 });

    const events = run.apply({ kind: 'end_round' });
    // Expect: crop_ready, crop_harvested, round_resolved, round_started, draws.
    const kinds = events.map(e => e.kind);
    expect(kinds).toContain('crop_ready');
    expect(kinds).toContain('crop_harvested');
    expect(kinds).toContain('round_resolved');
    expect(kinds).toContain('round_started');

    expect(run.state.coins).toBe(8); // single carrot, no combos
    expect(run.state.plots[0].kind).toBe('empty');
    expect(run.state.round).toBe(2);
  });

  it('applies Abundance + Loyal across rounds (carrot mono-strategy)', () => {
    const run = newRun(7, { drafts: false });
    // Round 1: plant 3 carrots if possible, end round → 3-stack Abundance (+20% each).
    const carrotIdxs = run.state.hand
      .map((id, i) => ({ id, i }))
      .filter(x => x.id === 'seed.humble_carrot')
      .map(x => x.i);

    // Plant up to 3 carrots into plots 0..2. Plant from highest hand index downward to keep indices stable.
    const toPlant = carrotIdxs.slice(0, 3).sort((a, b) => b - a);
    let plotI = 0;
    for (const handI of toPlant) {
      run.apply({ kind: 'play_seed', handIndex: handI, plotIndex: plotI++ });
    }
    if (toPlant.length < 2) return; // can't validate without enough carrots in hand
    const planted = toPlant.length;

    run.apply({ kind: 'end_round' });

    // Compute expected: with `planted` carrots same round, onslaught multiplier kicks in at 2+.
    // Relentless streak before round 1 is 0, so relentlessMult = 1.
    // Curve was rebalanced upward in the combat-focus pass (2025-04 design):
    //   2 → 1.25, 3 → 1.50, 4 → 1.85, 5 → 2.30, 6+ → 3.00.
    const abundance = planted >= 6 ? 3.00 : planted >= 5 ? 2.30 : planted >= 4 ? 1.85 : planted >= 3 ? 1.50 : planted >= 2 ? 1.25 : 1;
    const expectedCoins = Math.round(8 * abundance) * planted;
    expect(run.state.coins).toBe(expectedCoins);
    expect(run.state.relentlessStreak).toBe(1); // single-type round → streak +1
    expect(run.state.relentlessCrop).toBe('carrot');
  });
});

describe('SeasonRunner — full season ends in 12 rounds', () => {
  it('reaches season_end after 12 end_round calls and produces a rating', () => {
    const run = newRun(3);
    let lastEvents: RunEvent[] = [];
    for (let r = 0; r < 12; r++) {
      // Plant whatever seeds we can on empty plots.
      for (let p = 0; p < run.state.plots.length; p++) {
        if (run.state.plots[p].kind !== 'empty') continue;
        const seedIdx = run.state.hand.findIndex(id => id.startsWith('seed.'));
        if (seedIdx < 0) break;
        run.apply({ kind: 'play_seed', handIndex: seedIdx, plotIndex: p });
      }
      lastEvents = endRound(run);
      if (run.phase === 'season_end') break;
    }

    expect(run.phase).toBe('season_end');
    const seasonEnded = lastEvents.find(e => e.kind === 'season_ended');
    expect(seasonEnded).toBeDefined();
    if (seasonEnded?.kind === 'season_ended') {
      expect(seasonEnded.result.rounds).toBe(12);
      expect(['fail', 'survive', 'bronze', 'silver', 'gold', 'mythic']).toContain(seasonEnded.result.rating);
      expect(seasonEnded.result.finalCoins).toBeGreaterThanOrEqual(0);
    }
  });

  it('further actions are no-ops once season has ended', () => {
    const run = newRun(11, { drafts: false });
    for (let r = 0; r < 12; r++) run.apply({ kind: 'end_round' });
    expect(run.phase).toBe('season_end');
    const events = run.apply({ kind: 'end_round' });
    expect(events).toEqual([]);
  });
});

describe('SeasonRunner — tool effects', () => {
  it('Watering Can advances a planted seed by 1 tick', () => {
    const run = newRun(15);
    const cornIdx = run.state.hand.findIndex(id => id === 'seed.golden_corn');
    if (cornIdx < 0) return; // corn not in opening hand on this seed
    run.apply({ kind: 'play_seed', handIndex: cornIdx, plotIndex: 0 });
    const plot = run.state.plots[0];
    if (plot.kind !== 'growing') throw new Error('expected growing');
    const before = plot.crop.growRoundsRemaining;

    const wateringIdx = run.state.hand.findIndex(id => id === 'tool.watering_can');
    if (wateringIdx < 0) return;
    const events = run.apply({ kind: 'play_tool', handIndex: wateringIdx, targetPlotIndex: 0 });
    expect(events.some(e => e.kind === 'tool_used')).toBe(true);
    const after = run.state.plots[0];
    if (after.kind === 'growing') {
      expect(after.crop.growRoundsRemaining).toBe(before - 1);
    } else {
      // Corn is 2 rounds; after one watering it's 1. So it should still be growing.
      expect(after.kind).toBe('growing');
    }
  });

  it('Watering Can with no target is a no-op (card stays in hand)', () => {
    const run = newRun(15);
    const wateringIdx = run.state.hand.findIndex(id => id === 'tool.watering_can');
    if (wateringIdx < 0) return;
    const handBefore = run.state.hand.length;
    const events = run.apply({ kind: 'play_tool', handIndex: wateringIdx });
    expect(events).toEqual([]);
    expect(run.state.hand).toHaveLength(handBefore);
  });
});

describe('SeasonRunner — perks', () => {
  it('Early Bird perk grants +5 starting coins', () => {
    const earlyBird = {
      id: 'perk.early_bird', name: 'Early Bird', rarity: 'common', kind: 'passive',
      icon: '🌅', description: '', modifier: { type: 'starting_coins', value: 5 },
    } as const;
    const cfg = defaultSeasonConfig(1, { perks: [earlyBird] });
    const run = new SeasonRunner(cfg);
    expect(run.state.coins).toBe(5);
  });

  it('Bigger Hand perk increases hand size by 1', () => {
    const biggerHand = {
      id: 'perk.bigger_hand', name: 'Bigger Hand', rarity: 'uncommon', kind: 'passive',
      icon: '📋', description: '', modifier: { type: 'hand_size_delta', value: 1 },
    } as const;
    const cfg = defaultSeasonConfig(1, { perks: [biggerHand] });
    const run = new SeasonRunner(cfg);
    expect(run.state.hand).toHaveLength(6);
  });

  it('Plot Plus perk gives +1 plot slot', () => {
    const plotPlus = {
      id: 'perk.plot_plus', name: 'Plot Plus', rarity: 'uncommon', kind: 'passive',
      icon: '🚜', description: '', modifier: { type: 'plot_count_delta', value: 1 },
    } as const;
    const cfg = defaultSeasonConfig(1, { perks: [plotPlus] });
    const run = new SeasonRunner(cfg);
    expect(run.state.plots).toHaveLength(4);
  });

  it('Tycoon Touch perk applies +10% to harvest sale prices', () => {
    const tycoon = {
      id: 'perk.tycoon_touch', name: 'Tycoon Touch', rarity: 'rare', kind: 'passive',
      icon: '💰', description: '', modifier: { type: 'global_sale_mult', value: 0.1 },
    } as const;
    const cfg = defaultSeasonConfig(42, { perks: [tycoon], disableOrders: true });
    cfg.draftRounds = [];
    const run = new SeasonRunner(cfg);
    run.consumeOpeningEvents();
    const carrot = run.state.hand.indexOf('seed.humble_carrot');
    if (carrot < 0) return;
    run.apply({ kind: 'play_seed', handIndex: carrot, plotIndex: 0 });
    run.apply({ kind: 'end_round' });
    // Single carrot, no abundance/loyal: 8 base * 1.1 = 8.8 → rounds to 9.
    expect(run.state.coins).toBe(9);
  });
});

describe('SeasonRunner — undo plant', () => {
  it('returns a planted seed to hand if undone in the same round', () => {
    const run = newRun(42, { drafts: false });
    const handBefore = run.state.hand.length;
    const idx = run.state.hand.findIndex(id => id === 'seed.humble_carrot');
    expect(idx).toBeGreaterThanOrEqual(0);
    const cardId = run.state.hand[idx];

    run.apply({ kind: 'play_seed', handIndex: idx, plotIndex: 0 });
    expect(run.state.plots[0].kind).toBe('growing');
    expect(run.state.hand).toHaveLength(handBefore - 1);

    const events = run.apply({ kind: 'undo_plant', plotIndex: 0 });
    expect(events).toEqual([{ kind: 'plant_undone', cardId, plotIndex: 0, grade: 'F' }]);
    expect(run.state.plots[0].kind).toBe('empty');
    expect(run.state.hand).toContain(cardId);
    expect(run.state.hand).toHaveLength(handBefore);
  });

  it('cannot undo a plant from a previous round', () => {
    const run = newRun(42, { drafts: false });
    const idx = run.state.hand.findIndex(id => id === 'seed.golden_corn');
    if (idx < 0) return;
    run.apply({ kind: 'play_seed', handIndex: idx, plotIndex: 0 });
    run.apply({ kind: 'end_round' });
    // After end_round the plot is still growing (corn = 2 rounds), but plantedThisRound was cleared.
    if (run.state.plots[0].kind !== 'growing') return;
    const events = run.apply({ kind: 'undo_plant', plotIndex: 0 });
    expect(events).toEqual([]);
    expect(run.state.plots[0].kind).toBe('growing');
  });
});

describe('SeasonRunner — drafts', () => {
  it('pauses for draft after rounds 3, 6, 9', () => {
    const run = newRun(99);
    // End rounds 1, 2, 3 — draft should appear after round 3.
    run.apply({ kind: 'end_round' });
    expect(run.phase).toBe('play');
    run.apply({ kind: 'end_round' });
    expect(run.phase).toBe('play');
    run.apply({ kind: 'end_round' });
    expect(run.phase).toBe('draft');
    expect(run.pendingDraft.length).toBeGreaterThan(0);
  });

  it('draft_skip resumes the round without adding a card', () => {
    const run = newRun(123);
    for (let i = 0; i < 3; i++) run.apply({ kind: 'end_round' });
    expect(run.phase).toBe('draft');
    const discardBefore = run.state.discard.length;
    run.apply({ kind: 'draft_skip' });
    expect(run.phase).toBe('play');
    expect(run.state.discard.length).toBe(discardBefore);
  });

  it('draft_pick adds the chosen card to the discard pile', () => {
    const run = newRun(456);
    for (let i = 0; i < 3; i++) run.apply({ kind: 'end_round' });
    const offered = run.pendingDraft[0];
    const discardBefore = run.state.discard.length;
    run.apply({ kind: 'draft_pick', cardId: offered });
    expect(run.state.discard.length).toBe(discardBefore + 1);
    expect(run.state.discard).toContain(offered);
    expect(run.phase).toBe('play');
  });
});

describe('SeasonRunner — replay determinism', () => {
  it('replaying the same action log yields identical state', () => {
    const seed = 2024;
    const cfg = defaultSeasonConfig(seed);
    cfg.draftRounds = []; // no drafts: keeps the action log purely play actions.
    const a = new SeasonRunner(cfg);
    a.consumeOpeningEvents();
    for (let r = 0; r < 4; r++) {
      for (let p = 0; p < a.state.plots.length; p++) {
        if (a.state.plots[p].kind !== 'empty') continue;
        const seedIdx = a.state.hand.findIndex(id => id.startsWith('seed.'));
        if (seedIdx < 0) break;
        a.apply({ kind: 'play_seed', handIndex: seedIdx, plotIndex: p });
      }
      a.apply({ kind: 'end_round' });
    }

    const cfgB = defaultSeasonConfig(seed);
    cfgB.draftRounds = [];
    const b = new SeasonRunner(cfgB);
    b.consumeOpeningEvents();
    for (const action of a.actionLog) b.apply(action);

    expect(b.state).toEqual(a.state);
    expect(b.phase).toBe(a.phase);
  });
});
