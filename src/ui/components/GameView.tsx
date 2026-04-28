import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { GameScene } from '@game/GameScene';
import type { CardId, OrderCard, RunResult } from '@engine/index';
import DraftModal from '@ui/modals/DraftModal';
import CheatSheetButton from '@ui/components/CheatSheetButton';

interface Props {
  seed: number;
  perkIds: string[];
  ownedUpgradeIds: string[];
  customDeck?: string[];
  customDeckGrades?: string[];
  ownedCardIds?: string[];
  chosenOrders?: OrderCard[];
  // Stage being played. Forwarded into the scene so the runner stamps it
  // onto the RunResult — null/undefined for free-play runs.
  stageNumber?: number | null;
  onSeasonEnd: (result: RunResult) => void;
  onExit: () => void;
  isPvp?: boolean;
}

export default function GameView({ seed, perkIds, ownedUpgradeIds, customDeck, customDeckGrades, ownedCardIds, chosenOrders, stageNumber, onSeasonEnd, onExit, isPvp }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<GameScene | null>(null);

  const [draftOffer, setDraftOffer] = useState<CardId[] | null>(null);

  // Hold latest callbacks in refs so the Phaser scene always calls live closures.
  const endRef = useRef(onSeasonEnd);
  useEffect(() => { endRef.current = onSeasonEnd; }, [onSeasonEnd]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Render at the device's pixel ratio so canvas-side graphics (plots,
    // bars, particles, the hand-card chrome) match the crispness of the
    // text layer. Phaser default is 1× regardless of DPR, which is why the
    // game looked soft on retina / 4K. Cap at 3 to keep the GPU sane on
    // genuinely high-DPR phones.
    const dpr = Math.min(3, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      backgroundColor: '#0d3a14',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        // Phaser uses this to size the backing store; CSS size still tracks
        // the parent so layout doesn't change.
        zoom: 1,
      },
      // `resolution` is consumed by the renderer to scale the backing
      // canvas. `roundPixels: false` because rounding at sub-pixel coords
      // re-introduces softness when DPR > 1 (1.5× rounding loses precision).
      render: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        // @ts-expect-error — `resolution` is a runtime-honored Phaser option;
        // recent type defs dropped the field but the renderer still reads it.
        resolution: dpr,
      },
    });
    gameRef.current = game;

    const sceneData = {
      seed,
      perkIds,
      ownedUpgradeIds,
      customDeck: customDeck ?? [],
      customDeckGrades: customDeckGrades ?? [],
      ownedCardIds: ownedCardIds ?? [],
      chosenOrders: chosenOrders ?? [],
      stageNumber: stageNumber ?? null,
      isPvp: Boolean(isPvp),
      onSeasonEnd: (r: RunResult) => endRef.current(r),
      onDraftRequest: (cards: CardId[]) => setDraftOffer(cards),
    };

    // Phaser.Scenes.SceneManager.add() returns NULL if the game is still
    // booting — the scene gets queued in _pending and only created after the
    // game's READY event. If we ignore that and assign the null to sceneRef,
    // the scene runs fine in Phaser but every React-side reference is stale —
    // exactly the "stuck at round 4" symptom we hunted for hours. Handle both:
    // synchronous return (unlikely here but possible) AND deferred-via-READY.
    const sceneOrNull = game.scene.add('GameScene', GameScene, true, sceneData);
    if (sceneOrNull) {
      sceneRef.current = sceneOrNull as GameScene;
    } else {
      game.events.once('ready', () => {
        const scene = game.scene.getScene('GameScene') as GameScene | null;
        if (scene) sceneRef.current = scene;
      });
    }

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [seed, perkIds, ownedUpgradeIds, customDeck, customDeckGrades, ownedCardIds, chosenOrders, stageNumber, isPvp]);

  function resolveDraft(cardId: CardId | null) {
    setDraftOffer(null);
    sceneRef.current?.applyDraftChoice(cardId);
  }

  return (
    <div className="h-full w-full relative bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <button
        onClick={onExit}
        className="absolute top-3 right-3 z-10 pb-btn pb-btn-cream pb-btn-sm"
      >
        ← Quit
      </button>
      <CheatSheetButton />
      {draftOffer && (
        <DraftModal
          cards={draftOffer}
          onPick={cardId => resolveDraft(cardId)}
          onSkip={() => resolveDraft(null)}
        />
      )}
    </div>
  );
}
