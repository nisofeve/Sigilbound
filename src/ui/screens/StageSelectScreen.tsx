import { useMemo, useState } from 'react';
import type { Profile } from '@storage/index';
import { getStageDef, MAX_STAGES, isHardmodeUnlocked } from '@engine/index';
import DeckCarousel from '@ui/components/DeckCarousel';

interface Props {
  profile: Profile;
  onProfileChange?: (next: Profile) => void;
  onPick: (stage: number, hardmode?: boolean) => void;
  onBack: () => void;
  onDeck?: () => void;
}

const PAGE_SIZE = 20;

export default function StageSelectScreen({ profile, onProfileChange, onPick, onBack, onDeck }: Props) {
  const unlockedThrough = profile.currentStage;
  const showThrough = Math.min(MAX_STAGES, Math.max(unlockedThrough, 200));
  const totalPages = Math.max(1, Math.ceil(showThrough / PAGE_SIZE));
  const [page, setPage] = useState(() =>
    Math.min(totalPages - 1, Math.floor((unlockedThrough - 1) / PAGE_SIZE)),
  );
  const startStage = page * PAGE_SIZE + 1;
  const endStage = Math.min(showThrough, startStage + PAGE_SIZE - 1);

  const stages = useMemo(() => {
    const arr: number[] = [];
    for (let s = startStage; s <= endStage; s++) arr.push(s);
    return arr;
  }, [startStage, endStage]);

  const [mode, setMode] = useState<'normal' | 'hard'>('normal');

  // Hardmode: only show stages that are unlocked
  const hardmodeUnlocked = profile.hardmodeUnlockedThrough ?? 0;
  const isHardmodeTab = mode === 'hard';

  const handleModeChange = (newMode: 'normal' | 'hard') => {
    setMode(newMode);
    setPage(0); // Reset pagination when switching modes
  };

  const visibleStages = isHardmodeTab
    ? stages.filter(s => isHardmodeUnlocked(s, hardmodeUnlocked))
    : stages;

  return (
    <div
      className="safe-top safe-bottom"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg, #0a150c 0%, #060d07 60%, #0c0c10 100%)',
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 10,
        padding: '14px 16px 0px',
        borderBottom: '1px solid rgba(255,235,180,0.08)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
              border: '1.5px solid var(--sb-bronze-dark)',
              borderRadius: 8,
              color: 'var(--sb-gold-light)',
              padding: '6px 12px',
              cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.78rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
            }}
          >
            ← HOME
          </button>
          <div
            className="sb-mono"
            style={{ fontSize: '0.7rem', color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em' }}
          >
            {unlockedThrough}/{MAX_STAGES}
          </div>
        </div>

        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => handleModeChange('normal')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px 8px 0 0',
              background: mode === 'normal'
                ? 'linear-gradient(180deg, rgba(102,187,106,0.2) 0%, rgba(76,175,80,0.1) 100%)'
                : 'rgba(0,0,0,0.3)',
              border: mode === 'normal'
                ? '1.5px solid rgba(165,214,167,0.4)'
                : '1px solid rgba(255,255,255,0.05)',
              borderBottom: mode === 'normal' ? 'none' : '1px solid rgba(255,235,180,0.08)',
              color: mode === 'normal' ? '#a5d6a7' : 'rgba(255,255,255,0.5)',
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.8rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 140ms ease',
            }}
          >
            ⚔ NORMAL
          </button>
          {hardmodeUnlocked > 0 && (
            <button
              onClick={() => handleModeChange('hard')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px 8px 0 0',
                background: mode === 'hard'
                  ? 'linear-gradient(180deg, rgba(248,113,113,0.2) 0%, rgba(220,38,38,0.1) 100%)'
                  : 'rgba(0,0,0,0.3)',
                border: mode === 'hard'
                  ? '1.5px solid rgba(248,113,113,0.4)'
                  : '1px solid rgba(255,255,255,0.05)',
                borderBottom: mode === 'hard' ? 'none' : '1px solid rgba(255,235,180,0.08)',
                color: mode === 'hard' ? '#fca5a5' : 'rgba(255,255,255,0.5)',
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.8rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                transition: 'all 140ms ease',
              }}
            >
              🔥 HARDMODE
            </button>
          )}
        </div>
      </div>

      {/* ── Active deck — shared carousel design ── */}
      {onProfileChange && onDeck && (
        <div style={{ flexShrink: 0, margin: '8px 16px 4px' }}>
          <DeckCarousel
            profile={profile}
            onProfileChange={onProfileChange}
            onOpenDeck={onDeck}
          />
        </div>
      )}

      {/* ── Stage grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, maxWidth: 600, margin: '0 auto' }}>
          {visibleStages.map(s => (
            <StageCard
              key={s}
              stage={s}
              unlocked={isHardmodeTab ? isHardmodeUnlocked(s, hardmodeUnlocked) : s <= unlockedThrough}
              stars={isHardmodeTab ? (profile.hardmodeStageStars[s] ?? 0) : (profile.stageStars[s] ?? 0)}
              isCurrent={isHardmodeTab ? false : s === unlockedThrough}
              isHardmode={isHardmodeTab}
              onPick={() => onPick(s, isHardmodeTab)}
            />
          ))}
        </div>
      </div>

      {/* ── Pagination ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px 12px',
        borderTop: '1px solid rgba(255,235,180,0.08)',
        background: 'linear-gradient(180deg, transparent 0%, rgba(10,8,6,0.7) 100%)',
        gap: 12,
      }}>
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          style={{
            background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: 8,
            color: 'var(--sb-gold-light)',
            padding: '6px 14px',
            cursor: page === 0 ? 'not-allowed' : 'pointer',
            opacity: page === 0 ? 0.35 : 1,
            fontFamily: "'Nunito', sans-serif",
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}
        >
          ← PREV
        </button>
        <span className="sb-mono" style={{ fontSize: '0.72rem', color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em' }}>
          {startStage}–{endStage}
        </span>
        <button
          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          style={{
            background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: 8,
            color: 'var(--sb-gold-light)',
            padding: '6px 14px',
            cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer',
            opacity: page >= totalPages - 1 ? 0.35 : 1,
            fontFamily: "'Nunito', sans-serif",
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}
        >
          NEXT →
        </button>
      </div>
    </div>
  );
}

// ─── Stage Card ───────────────────────────────────────────────────────────────

function StageCard({
  stage, unlocked, stars, isCurrent, isHardmode, onPick,
}: {
  stage: number;
  unlocked: boolean;
  stars: 0 | 1 | 2 | 3;
  isCurrent: boolean;
  isHardmode?: boolean;
  onPick: () => void;
}) {
  const def = unlocked ? getStageDef(stage) : null;
  const isBoss = def?.kind === 'boss' || stage % 10 === 0;

  return (
    <button
      onClick={unlocked ? onPick : undefined}
      disabled={!unlocked}
      style={{
        position: 'relative',
        borderRadius: 10,
        padding: '10px 12px',
        textAlign: 'left',
        cursor: unlocked ? 'pointer' : 'not-allowed',
        background: !unlocked
          ? 'rgba(0,0,0,0.5)'
          : isHardmode
            ? isBoss
              ? 'linear-gradient(160deg, rgba(155,40,40,0.7) 0%, rgba(80,20,20,0.8) 100%)'
              : 'linear-gradient(160deg, rgba(80,60,40,0.6) 0%, rgba(40,30,20,0.8) 100%)'
            : isBoss
              ? 'linear-gradient(160deg, rgba(127,29,29,0.6) 0%, rgba(60,12,12,0.7) 100%)'
              : 'linear-gradient(160deg, rgba(34,89,46,0.35) 0%, rgba(6,13,7,0.7) 100%)',
        border: `1.5px solid ${!unlocked
          ? 'rgba(255,255,255,0.06)'
          : isHardmode
            ? '#dc2626'
            : isBoss
              ? '#f87171'
              : '#4ade8066'
        }`,
        boxShadow: isCurrent
          ? '0 0 0 2px #fbbf24, 0 4px 12px rgba(251,191,36,0.2)'
          : !unlocked
            ? 'none'
            : '0 3px 8px rgba(0,0,0,0.4)',
        opacity: unlocked ? 1 : 0.5,
        transition: 'all 140ms ease',
        minHeight: 84,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* Current badge */}
      {isCurrent && (
        <div style={{
          position: 'absolute', top: -8, right: -2,
          background: '#fbbf24', color: '#3a2000',
          border: '1.5px solid #3a2000',
          borderRadius: 999,
          fontSize: 8, fontWeight: 800,
          padding: '2px 7px',
          letterSpacing: '0.1em',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          fontFamily: "'Nunito', sans-serif",
        }}>
          NOW
        </div>
      )}

      {/* Hardmode skull overlay */}
      {isHardmode && unlocked && (
        <div style={{
          position: 'absolute', top: 4, right: 4,
          fontSize: 18, opacity: 0.6,
        }}>
          💀
        </div>
      )}

      {/* Top: stage number + boss/lock icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.4)', letterSpacing: '0.15em', marginBottom: 1 }}>
            {isHardmode ? 'HARD' : 'STAGE'}
          </div>
          <div className="sb-display" style={{ fontSize: 22, color: isBoss ? '#fca5a5' : 'var(--sb-gold-light)', lineHeight: 1 }}>
            {stage}
          </div>
        </div>
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>
          {!unlocked ? '🔒' : isHardmode ? '💀' : isBoss ? '👑' : ''}
        </span>
      </div>

      {/* Bottom: goal count + stars */}
      <div>
        {def && (
          <div className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.3)', letterSpacing: '0.08em', marginBottom: 4 }}>
            {def.orders.length} GOAL{def.orders.length === 1 ? '' : 'S'}
          </div>
        )}
        {unlocked && (
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3].map(i => (
              <span
                key={i}
                style={{ fontSize: 11, color: stars >= i ? '#fbbf24' : 'rgba(255,255,255,0.12)', lineHeight: 1 }}
              >
                ★
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
