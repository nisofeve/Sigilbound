// Sigilbound combat host. Owns the BattleRunner, drives the Phaser
// CombatScene, and surfaces outcome to the parent React shell.
//
// Phase 6F refactor: hand + deck + discard + stamina now live on the runner.
// React reads them directly each render. Click-to-play handles tactics
// (drag-to-bind handles actions, as in Phase 5).

import { useEffect, useMemo, useRef, useState } from 'react';
import Phaser from 'phaser';
import { CombatScene } from '@game/CombatScene';
import {
  buildStageRun,
  type CombatStageDef,
  type BattleRunner,
  type EquippedSet,
  type Perk,
  getAction,
  getTactic,
} from '@engine/index';

interface Props {
  stageNumber: number;
  playerLevel: number;
  equipment?: EquippedSet;
  talents?: ReadonlyArray<Perk>;
  reactions?: ReadonlyArray<string>;
  // Phase 7: player's custom combat deck. When set + non-empty, BattleRunner
  // uses this directly. Otherwise falls back to gear-only auto-deck.
  customDeck?: ReadonlyArray<string>;
  // Phase 6E: HP carry-over for Hardcore arc mode. When provided, the
  // runner starts at this HP instead of full.
  initialHp?: number;
  hardcore?: boolean;
  onOutcome: (outcome: 'cleared' | 'defeated', stage: CombatStageDef, runner: BattleRunner) => void;
  onExit: () => void;
}

export default function CombatView({
  stageNumber, playerLevel, equipment, talents, reactions, customDeck, initialHp, hardcore,
  onOutcome, onExit,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<CombatScene | null>(null);

  // Build the runner exactly once per stage. useMemo keys on stageNumber
  // so navigating between stages produces a fresh runner.
  const { runner, stage } = useMemo(() => {
    const result = buildStageRun({
      stageNumber, playerLevel, equipment, talents, reactions,
      customDeck, initialHp, hardcore,
    });
    return { runner: result.runner, stage: result.stage };
  }, [stageNumber, playerLevel, equipment, talents, reactions, customDeck, initialHp, hardcore]);

  // Force-render token. Bumped on any runner state mutation so React reads
  // the latest hand/deck/stamina from `runner.state`.
  const [tick, setTick] = useState(0);
  const forceRepaint = () => setTick(t => t + 1);
  void tick; // referenced solely to keep React happy about the hook deps.

  useEffect(() => {
    if (!containerRef.current) return;

    // Register the scene class. Phaser auto-starts it (init/create with no
    // data — those guarded paths handle that), then we restart it with the
    // real data payload below. Restart triggers init() with the new data
    // and create() runs again with the runner attached.
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#18120e',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [CombatScene],
      physics: { default: 'arcade' },
      banner: false,
    });
    gameRef.current = game;

    setTimeout(() => {
      if (!gameRef.current) return;
      const scene = gameRef.current.scene.getScene('CombatScene') as CombatScene;
      sceneRef.current = scene;
      scene.scene.start('CombatScene', {
        runner,
        initialHand: runner.state.hand.filter(id => !!getAction(id)),
        callbacks: {
          onEndTurnPressed: () => handleEndTurn(),
          onBindToSlot: (handIndex: number, slotIndex: number) => handleBindToSlot(handIndex, slotIndex),
          onOutcome: (outcome: 'cleared' | 'defeated') => onOutcome(outcome, stage, runner),
        },
      });
    }, 0);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [runner, stage, onOutcome]);

  function handleBindToSlot(handIndex: number, slotIndex: number): void {
    // The Phaser scene was given only Action cards — its handIndex addresses
    // that filtered list. Translate back to runner.state.hand index.
    const actionsOnly = runner.state.hand
      .map((id, i) => ({ id, i }))
      .filter(x => !!getAction(x.id));
    const realIdx = actionsOnly[handIndex]?.i ?? -1;
    if (realIdx < 0) return;
    const ok = runner.bindHandToSlot(realIdx, slotIndex);
    if (!ok) return;
    syncSceneHand();
    sceneRef.current?.refreshAll();
    forceRepaint();
  }

  function handlePlayTactic(realHandIndex: number): void {
    const result = runner.playTactic(realHandIndex);
    if (result === 'played') {
      syncSceneHand();
      sceneRef.current?.refreshAll();
      forceRepaint();
    }
  }

  function syncSceneHand(): void {
    // Push the action subset of the hand into the Phaser scene.
    const actionIds = runner.state.hand.filter(id => !!getAction(id));
    sceneRef.current?.setHand(actionIds);
  }

  function handleEndTurn(): void {
    const before = { ...runner.state.combosTriggeredThisStage };
    const outcome = runner.endTurn();
    const after = runner.state.combosTriggeredThisStage;

    if (sceneRef.current) {
      if (after.onslaught > before.onslaught) sceneRef.current.flashCombo('onslaught');
      if (after.triadic > before.triadic) sceneRef.current.flashCombo('triadic');
      if (after.relentless > before.relentless) sceneRef.current.flashCombo('relentless');
    }

    syncSceneHand();
    sceneRef.current?.refreshAll();
    forceRepaint();

    if (outcome !== 'in_progress') {
      onOutcome(outcome, stage, runner);
    }
  }

  // Tactics in current hand — surfaced as a clickable row.
  const tactics = runner.state.hand
    .map((id, i) => ({ def: getTactic(id), realIndex: i }))
    .filter((t): t is { def: NonNullable<ReturnType<typeof getTactic>>; realIndex: number } => !!t.def);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar: stage title banner + Hardcore tag */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10 pointer-events-none">
        <span
          className="sb-display text-[12px] px-4 py-1.5"
          style={{
            background: 'linear-gradient(180deg, #3a2a1c 0%, #1a120a 50%, #3a2a1c 100%)',
            border: '2px solid var(--sb-bronze)',
            color: 'var(--sb-gold-light)',
            letterSpacing: '0.18em',
            textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.3), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          ⚔ {stage.title.toUpperCase()}
        </span>
        {hardcore && (
          <span
            className="sb-display text-[10px] px-2 py-1 sb-pulse-crimson"
            style={{
              background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
              border: '1.5px solid var(--sb-gold)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.25em',
              textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            HARDCORE
          </span>
        )}
      </div>

      {/* Flee button — leather chip in top-left */}
      <button
        onClick={onExit}
        className="absolute top-2 left-2 z-10 sb-chip"
        style={{ cursor: 'pointer', padding: '5px 11px', fontSize: '11px' }}
      >
        ← FLEE
      </button>

      {/* Right rail: stamina + deck + discard chips. Read from runner each render. */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5 pointer-events-none">
        <span className="sb-chip sb-chip-gold" style={{ fontSize: '12px' }}>
          ⚡ {runner.state.staminaThisTurn} STAMINA
        </span>
        <span className="sb-chip">
          🃏 {runner.state.deck.length} DECK
        </span>
        <span className="sb-chip" style={{ opacity: 0.75 }}>
          🗑 {runner.state.discard.length} DISCARD
        </span>
      </div>

      {/* Tactic scrolls — left rail. Each tactic is a parchment chit with
          rarity edge + Cinzel name. Click to play; disabled state grays out. */}
      {tactics.length > 0 && (
        <div className="absolute bottom-44 left-2 z-10 flex flex-col gap-1.5 max-w-[240px] sb-fade-up">
          <div className="sb-display text-[10px] tracking-[0.25em] opacity-70" style={{ color: 'var(--sb-gold-light)' }}>
            ✦ TACTICS ({tactics.length})
          </div>
          {tactics.map(({ def, realIndex }) => {
            const canAfford = runner.state.staminaThisTurn >= def.cost;
            return (
              <button
                key={`${def.id}-${realIndex}`}
                onClick={() => handlePlayTactic(realIndex)}
                disabled={!canAfford}
                className={`sb-rarity-${def.rarity} flex items-center gap-2 px-2.5 py-2 text-left transition-all`}
                style={{
                  background: canAfford
                    ? 'linear-gradient(180deg, var(--sb-parchment) 0%, var(--sb-parchment-dark) 100%)'
                    : 'linear-gradient(180deg, #44372a 0%, #2a1f15 100%)',
                  border: '2px solid var(--sb-parchment-edge)',
                  borderRadius: '4px',
                  color: canAfford ? '#2c1810' : '#5b3a1f',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  opacity: canAfford ? 1 : 0.55,
                  boxShadow: canAfford ? 'inset 0 0 0 1px rgba(255,235,180,0.35), 0 2px 6px rgba(0,0,0,0.45)' : '0 1px 3px rgba(0,0,0,0.4)',
                }}
                title={def.description}
              >
                <span className="text-xl flex-shrink-0">{def.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="sb-display font-bold truncate" style={{ fontSize: '12px' }}>{def.name}</div>
                  <div className="sb-mono text-[9px] truncate opacity-80">⚡ {def.cost} · {def.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
