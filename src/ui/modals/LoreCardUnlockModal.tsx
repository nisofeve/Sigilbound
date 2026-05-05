// LoreCardUnlockModal — celebratory card reveal shown after a battle when the
// player unlocks one or more lore milestones. Steps through unlocks one at a
// time: a card flies in, flips to reveal title + lore number + body, and the
// player taps Continue to advance (or close, on the last card).

import { useEffect, useMemo, useState } from 'react';
import { allLoreMilestones, type LoreMilestone } from '@engine/lore';
import { IMAGE_MANIFEST } from '@ui/components/imageManifest';

interface Props {
  // Stage numbers of newly-unlocked lore milestones (in order).
  stageNumbers: number[];
  onClose: () => void;
}

type RevealPhase = 'enter' | 'flip' | 'read';

export default function LoreCardUnlockModal({ stageNumbers, onClose }: Props) {
  const milestones = useMemo(() => {
    const all = allLoreMilestones();
    return stageNumbers
      .map(n => all.find(m => m.stage === n))
      .filter((m): m is LoreMilestone => !!m);
  }, [stageNumbers]);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<RevealPhase>('enter');

  const current = milestones[idx];
  const loreNumber = useMemo(() => {
    if (!current) return 0;
    return allLoreMilestones().findIndex(m => m.stage === current.stage) + 1;
  }, [current]);

  // Drive the reveal sequence: enter (card slides in face-down) → flip
  // (rotates to face-up) → read (idle, waiting for the player).
  useEffect(() => {
    setPhase('enter');
    const t1 = window.setTimeout(() => setPhase('flip'), 350);
    const t2 = window.setTimeout(() => setPhase('read'), 1100);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [idx]);

  if (!current) {
    // Defensive: nothing to show.
    onClose();
    return null;
  }

  const isLast = idx === milestones.length - 1;

  function handleContinue() {
    if (isLast) {
      onClose();
    } else {
      setIdx(i => i + 1);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: 'radial-gradient(ellipse at center, rgba(40,20,60,0.85) 0%, rgba(0,0,0,0.95) 100%)',
        backdropFilter: 'blur(6px)',
      }}
    >
      {/* Drifting embers / sparkles for atmosphere. */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute pb-bob"
            style={{
              top: `${(i * 17) % 100}%`,
              left: `${(i * 31) % 100}%`,
              fontSize: 12 + (i % 4) * 4,
              opacity: 0.35,
              animationDelay: `${i * 0.15}s`,
              animationDuration: `${3 + (i % 4) * 0.7}s`,
              filter: 'drop-shadow(0 0 4px rgba(200,160,255,0.5))',
            }}
          >
            {['✨', '✦', '⋆', '✧'][i % 4]}
          </div>
        ))}
      </div>

      <div className="relative w-full max-w-md flex flex-col items-center gap-4">
        {/* Banner */}
        <div className="text-center">
          <div
            className="text-[10px] uppercase tracking-[0.4em] font-extrabold mb-1"
            style={{ color: '#c8b8e8' }}
          >
            New Lore Unlocked
          </div>
          <div
            className="sb-display text-2xl"
            style={{
              color: '#f5e6ff',
              textShadow: '0 0 12px rgba(200,160,255,0.6), 0 2px 4px rgba(0,0,0,0.8)',
              letterSpacing: '0.2em',
            }}
          >
            📜 LORE CARD
          </div>
          {milestones.length > 1 && (
            <div className="text-[10px] mt-1 opacity-60" style={{ color: '#c8b8e8' }}>
              {idx + 1} of {milestones.length}
            </div>
          )}
        </div>

        {/* Card */}
        <LoreCard milestone={current} loreNumber={loreNumber} phase={phase} />

        {/* Continue button — appears after the flip lands. */}
        <button
          onClick={handleContinue}
          disabled={phase !== 'read'}
          className="pb-btn pb-btn-gold pb-btn-md"
          style={{
            minWidth: 200,
            opacity: phase === 'read' ? 1 : 0,
            transform: phase === 'read' ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 240ms ease-out, transform 240ms ease-out',
            pointerEvents: phase === 'read' ? 'auto' : 'none',
          }}
        >
          {isLast ? '✓ Add to Journal' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

// ─── Card visual ────────────────────────────────────────────────────────────

function LoreCard({
  milestone,
  loreNumber,
  phase,
}: {
  milestone: LoreMilestone;
  loreNumber: number;
  phase: RevealPhase;
}) {
  // Look up optional art from the manifest. Falls back to a gradient + scroll
  // emoji if the asset isn't present.
  const artKey = `lore/${milestone.stage}`;
  const artUrl = IMAGE_MANIFEST[artKey] ?? null;

  // Card size — fits comfortably in the modal on mobile and desktop.
  const W = 280;
  const H = 400;

  const enterTransform = phase === 'enter'
    ? 'translateY(40px) scale(0.85) rotateY(180deg)'
    : phase === 'flip'
      ? 'translateY(0) scale(1) rotateY(90deg)'
      : 'translateY(0) scale(1) rotateY(0deg)';

  return (
    <div
      style={{
        width: W,
        height: H,
        perspective: 1400,
        opacity: phase === 'enter' ? 0 : 1,
        transition: 'opacity 350ms ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transformStyle: 'preserve-3d',
          transform: enterTransform,
          transition: phase === 'enter'
            ? 'transform 350ms cubic-bezier(0.2,0.8,0.2,1)'
            : 'transform 750ms cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        {/* Face — visible after the flip lands. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 18,
            backfaceVisibility: 'hidden',
            background: artUrl
              ? `linear-gradient(180deg, rgba(20,10,30,0.0) 30%, rgba(20,10,30,0.85) 80%, rgba(20,10,30,0.95) 100%), url(${artUrl}) center/cover`
              : 'linear-gradient(135deg, #3a2050 0%, #1a0f2a 60%, #0a0515 100%)',
            border: '2px solid rgba(200,160,255,0.6)',
            boxShadow: '0 0 32px rgba(160,100,240,0.45), 0 8px 24px rgba(0,0,0,0.6), inset 0 0 40px rgba(200,160,255,0.08)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            padding: 14,
            color: '#f5e6ff',
            overflow: 'hidden',
          }}
        >
          {/* Top-left lore number badge */}
          <div
            style={{
              position: 'absolute',
              top: 10, left: 10,
              padding: '3px 10px',
              borderRadius: 99,
              background: 'linear-gradient(180deg, rgba(200,160,255,0.35) 0%, rgba(120,80,180,0.25) 100%)',
              border: '1.5px solid rgba(200,160,255,0.6)',
              fontSize: '0.62rem',
              fontWeight: 800,
              letterSpacing: '0.2em',
              color: '#f5e6ff',
              textShadow: '0 1px 2px rgba(0,0,0,0.6)',
            }}
          >
            LORE #{loreNumber}
          </div>

          {/* Top-right scroll emoji decoration if no art */}
          {!artUrl && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '6rem',
                opacity: 0.18,
                filter: 'drop-shadow(0 0 12px rgba(200,160,255,0.6))',
                pointerEvents: 'none',
              }}
            >
              📜
            </div>
          )}

          {/* Title + body anchored bottom */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div
              className="sb-display"
              style={{
                fontSize: '1.1rem',
                lineHeight: 1.2,
                color: '#fff5e0',
                textShadow: '0 2px 6px rgba(0,0,0,0.85), 0 0 12px rgba(200,160,255,0.4)',
                marginBottom: 10,
                letterSpacing: '0.04em',
              }}
            >
              {milestone.title}
            </div>
            <div
              style={{
                fontSize: '0.72rem',
                lineHeight: 1.55,
                color: '#e0d0f0',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                maxHeight: 170,
                overflowY: 'auto',
                paddingRight: 4,
                scrollbarWidth: 'thin',
                scrollbarColor: 'rgba(200,160,255,0.4) transparent',
              }}
            >
              {milestone.text}
            </div>
          </div>
        </div>

        {/* Back — visible before the flip. */}
        <div
          style={{
            position: 'absolute', inset: 0,
            borderRadius: 18,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'linear-gradient(135deg, #2a1845 0%, #150a25 100%)',
            border: '2px solid rgba(200,160,255,0.6)',
            boxShadow: '0 0 32px rgba(160,100,240,0.45), 0 8px 24px rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: '5rem',
              filter: 'drop-shadow(0 0 16px rgba(200,160,255,0.8))',
              opacity: 0.85,
            }}
          >
            📜
          </div>
          {/* Concentric ring decoration */}
          <div
            style={{
              position: 'absolute',
              inset: 12,
              border: '1px solid rgba(200,160,255,0.25)',
              borderRadius: 14,
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 24,
              border: '1px solid rgba(200,160,255,0.15)',
              borderRadius: 10,
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>
    </div>
  );
}
