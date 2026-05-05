import { useMemo, useEffect, useState, useCallback } from 'react';
import { allStages, getEnemy } from '@engine/index';
import type { BestiaryEntry } from '@engine/bestiary';
import { EnemyCard } from '@ui/components/EnemyCard';
import { sfx } from '@game/sfx';

const BIOME_ACCENTS: Record<string, { bg: string; border: string; glow: string; label: string }> = {
  forest:    { bg: 'linear-gradient(160deg, #0a1f0d 0%, #060d07 100%)', border: '#4ade80', glow: 'rgba(74,222,128,0.35)',  label: 'Whispering Forest' },
  crypts:    { bg: 'linear-gradient(160deg, #130a1f 0%, #0a0612 100%)', border: '#a78bfa', glow: 'rgba(167,139,250,0.35)', label: 'Sunken Crypts' },
  frostpeak: { bg: 'linear-gradient(160deg, #091828 0%, #050d18 100%)', border: '#93c5fd', glow: 'rgba(147,197,253,0.4)',  label: 'Frostpeak Hollows' },
  volcano:   { bg: 'linear-gradient(160deg, #1f0a04 0%, #120502 100%)', border: '#f97316', glow: 'rgba(249,115,22,0.4)',   label: 'Volcanic Forge' },
  ashen:     { bg: 'linear-gradient(160deg, #1f051a 0%, #12030f 100%)', border: '#ec4899', glow: 'rgba(236,72,153,0.4)',   label: 'Ashen Citadel' },
};

// Mystic entrance: deep ominous drone + shimmer sparkle
function playMysticEnter() {
  sfx.comboRelentless();
  sfx.magic();
}

// Mystic exit: portal whoosh + arcane burst
function playMysticExit() {
  sfx.whoosh();
  sfx.arcaneHit();
}

interface Props {
  stageNumber: number;
  onContinue: () => void;
  onSkip: () => void;
}

export default function StageIntroScreen({ stageNumber, onContinue, onSkip }: Props) {
  const stages = useMemo(() => allStages(), []);
  const stage = stages.find(s => s.number === stageNumber) ?? stages[0];
  const accent = BIOME_ACCENTS[stage.biome] ?? BIOME_ACCENTS.forest;

  const enemies = useMemo(
    () => stage.enemyIds.map(id => getEnemy(id)).filter((e): e is BestiaryEntry => e !== undefined),
    [stage.enemyIds]
  );

  const primaryEnemy = enemies[0];
  const loreText = primaryEnemy?.lore;
  const isBoss = stage.isBoss || stageNumber % 10 === 0;

  // Entrance: start invisible, fade in
  const [visible, setVisible] = useState(false);
  // Exiting: trigger exit animation before calling callback
  const [exiting, setExiting] = useState(false);
  // Stagger enemy cards in after entrance
  const [enemiesVisible, setEnemiesVisible] = useState(false);

  useEffect(() => {
    playMysticEnter();
    const t1 = setTimeout(() => setVisible(true), 30);
    const t2 = setTimeout(() => setEnemiesVisible(true), 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const exit = useCallback((cb: () => void) => {
    playMysticExit();
    setExiting(true);
    setTimeout(cb, 420);
  }, []);

  const handleContinue = useCallback(() => exit(onContinue), [exit, onContinue]);
  const handleSkip     = useCallback(() => exit(onSkip),     [exit, onSkip]);

  return (
    <div
      className="safe-top safe-bottom h-full w-full flex flex-col items-center justify-center relative overflow-hidden"
      style={{
        background: accent.bg,
        color: '#e2e8f0',
        opacity: exiting ? 0 : visible ? 1 : 0,
        transform: exiting
          ? 'scale(1.06) translateY(-12px)'
          : visible
            ? 'scale(1) translateY(0)'
            : 'scale(0.94) translateY(20px)',
        transition: exiting
          ? 'opacity 380ms ease-in, transform 380ms cubic-bezier(0.4,0,1,1)'
          : 'opacity 480ms cubic-bezier(0.2,0.8,0.2,1), transform 480ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
    >
      {/* Animated glow orb */}
      <div style={{
        position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)',
        width: 340, height: 340, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent.glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
        animation: 'pb-bob 4s ease-in-out infinite',
        opacity: visible ? 1 : 0,
        transition: 'opacity 800ms ease 200ms',
      }} />

      {/* Secondary deep glow for mystic depth */}
      <div style={{
        position: 'absolute', bottom: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, ${accent.glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
        opacity: visible ? 0.5 : 0,
        transition: 'opacity 1000ms ease 400ms',
      }} />

      {/* Mystic particle shimmer lines */}
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${20 + i * 25}%`,
            left: 0,
            right: 0,
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${accent.border}22 30%, ${accent.border}55 50%, ${accent.border}22 70%, transparent 100%)`,
            pointerEvents: 'none',
            opacity: visible ? 1 : 0,
            transition: `opacity 600ms ease ${300 + i * 150}ms`,
          }}
        />
      ))}

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-md w-full gap-5">

        {/* Stage badge */}
        <div
          className="flex flex-col items-center gap-1"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(-16px)',
            transition: 'opacity 500ms ease 100ms, transform 500ms cubic-bezier(0.2,0.8,0.2,1) 100ms',
          }}
        >
          <div
            className="sb-mono"
            style={{ fontSize: '0.65rem', letterSpacing: '0.3em', color: accent.border, opacity: 0.85 }}
          >
            {isBoss ? '⚠ BOSS ENCOUNTER' : `${accent.label.toUpperCase()} · STAGE ${stageNumber}`}
          </div>
          <div
            className="sb-display text-center"
            style={{ fontSize: isBoss ? '2rem' : '1.6rem', color: 'var(--sb-gold-light)', lineHeight: 1.1 }}
          >
            {isBoss ? '👑 ' : ''}{stage.title}
          </div>
          <div
            className="sb-mono"
            style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color: 'rgba(255,235,180,0.4)', marginTop: 2 }}
          >
            STAGE {stageNumber}
          </div>
        </div>

        {/* Enemy card row — actual EnemyCard visuals */}
        {enemies.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: enemies.length > 2 ? 8 : 14,
              justifyContent: 'center',
              flexWrap: 'wrap',
              padding: '4px 0',
            }}
          >
            {enemies.map((e, i) => (
              <div
                key={e.id}
                style={{
                  opacity: enemiesVisible ? 1 : 0,
                  transform: enemiesVisible ? 'translateY(0) scale(1)' : 'translateY(24px) scale(0.88)',
                  transition: `opacity 500ms cubic-bezier(0.2,0.8,0.2,1) ${i * 120}ms, transform 500ms cubic-bezier(0.2,0.8,0.2,1) ${i * 120}ms`,
                  filter: `drop-shadow(0 0 12px ${accent.glow})`,
                }}
              >
                <EnemyCard enemy={e} size={enemies.length > 2 ? 'xs' : 'sm'} />
              </div>
            ))}
          </div>
        )}

        {/* Divider */}
        <div
          style={{
            width: '100%', height: 1,
            background: `linear-gradient(90deg, transparent, ${accent.border}55, transparent)`,
            opacity: visible ? 1 : 0,
            transition: 'opacity 500ms ease 350ms',
          }}
        />

        {/* Lore text */}
        {loreText && (
          <p
            style={{
              fontSize: '0.78rem',
              lineHeight: 1.7,
              color: 'rgba(226,232,240,0.8)',
              fontFamily: "'Nunito', sans-serif",
              fontWeight: 600,
              textAlign: 'center',
              fontStyle: 'italic',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(12px)',
              transition: 'opacity 600ms ease 500ms, transform 600ms cubic-bezier(0.2,0.8,0.2,1) 500ms',
            }}
          >
            {loreText}
          </p>
        )}

        {/* Difficulty / reward info */}
        <div
          style={{
            display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
            opacity: visible ? 1 : 0,
            transition: 'opacity 500ms ease 650ms',
          }}
        >
          <Chip label="DIFFICULTY" value={stage.difficultyBand.toUpperCase()} color={accent.border} />
          <Chip label="REWARD" value={`${stage.rewardChest.baseGold}g`} color="#fbbf24" />
          {isBoss && <Chip label="TYPE" value="BOSS" color="#f87171" />}
        </div>

      </div>

      {/* Bottom CTA */}
      <div
        className="absolute bottom-0 left-0 right-0 flex gap-3 px-6 pb-6 pt-4 z-20"
        style={{
          background: 'linear-gradient(0deg, rgba(0,0,0,0.7) 0%, transparent 100%)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 500ms ease 700ms, transform 500ms cubic-bezier(0.2,0.8,0.2,1) 700ms',
        }}
      >
        <button
          onClick={handleSkip}
          className="sb-chip flex-1"
          style={{ padding: '12px 16px', fontSize: '12px', cursor: 'pointer' }}
        >
          SKIP
        </button>
        <button
          onClick={handleContinue}
          className="sb-btn sb-pulse-crimson flex-2"
          style={{ flex: 2, fontSize: '14px', padding: '14px 18px', letterSpacing: '0.2em' }}
        >
          CONTINUE →
        </button>
      </div>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: 'rgba(0,0,0,0.4)',
        border: `1px solid ${color}44`,
        borderRadius: 6,
        padding: '4px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
      }}
    >
      <span style={{ fontSize: '0.5rem', fontFamily: "'Nunito', sans-serif", fontWeight: 800, letterSpacing: '0.15em', color: 'rgba(255,235,180,0.4)' }}>{label}</span>
      <span style={{ fontSize: '0.72rem', fontFamily: "'Nunito', sans-serif", fontWeight: 800, color }}>{value}</span>
    </div>
  );
}
