import { useMemo, useState } from 'react';
import type { Profile } from '@storage/index';
import { getStageDef, allActions, allTactics } from '@engine/index';

interface Props {
  profile: Profile;
  onPick: (stage: number) => void;
  onBack: () => void;
  onDeck?: () => void;
}

const PAGE_SIZE = 20;


const RARITY_PIPS: Array<{ key: string; color: string }> = [
  { key: 'common',    color: '#94a3b8' },
  { key: 'uncommon',  color: '#4ade80' },
  { key: 'rare',      color: '#60a5fa' },
  { key: 'epic',      color: '#c084fc' },
  { key: 'legendary', color: '#fbbf24' },
  { key: 'mythic',    color: '#f87171' },
];

export default function StageSelectScreen({ profile, onPick, onBack, onDeck }: Props) {
  const unlockedThrough = profile.currentStage;
  const showThrough = Math.max(unlockedThrough, 200);
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

  // Deck HUD data
  const allCardDefs = useMemo(() => {
    const actions = allActions();
    const tactics = allTactics();
    return new Map([...actions, ...tactics].map(c => [c.id, c]));
  }, []);

  const deckCards = profile.combatDeck
    .map(id => allCardDefs.get(id))
    .filter(Boolean) as Array<{ id: string; type: string; rarity: string; name: string; emoji?: string }>;

  const deckTotal = deckCards.length;
  const deckActions = deckCards.filter(c => c.type === 'action').length;
  const deckTactics = deckCards.filter(c => c.type === 'tactic').length;
  const deckRarity = deckCards.reduce<Record<string, number>>((acc, c) => {
    acc[c.rarity] = (acc[c.rarity] ?? 0) + 1;
    return acc;
  }, {});
  const previewEmojis = [...new Map(deckCards.filter(c => c.emoji).map(c => [c.id, c.emoji])).values()].slice(0, 5) as string[];

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
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,235,180,0.08)',
        flexShrink: 0,
      }}>
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
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div
            className="sb-display"
            style={{ fontSize: '1.1rem', color: 'var(--sb-gold-light)', letterSpacing: '0.25em' }}
          >
            ⚔ STAGES
          </div>
        </div>
        <div
          className="sb-mono"
          style={{ fontSize: '0.7rem', color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em', minWidth: 52, textAlign: 'right' }}
        >
          {unlockedThrough}/200
        </div>
      </div>

      {/* ── Deck HUD strip ── */}
      <button
        onClick={onDeck}
        disabled={!onDeck}
        style={{
          flexShrink: 0,
          margin: '8px 16px 4px',
          background: 'linear-gradient(180deg, rgba(44,24,16,0.8) 0%, rgba(20,12,8,0.85) 100%)',
          border: '1.5px solid var(--sb-bronze-dark)',
          borderRadius: 10,
          padding: '8px 12px',
          cursor: onDeck ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.08)',
          textAlign: 'left',
        }}
      >
        {/* Left: label + count */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12 }}>🃏</span>
            <span className="sb-display" style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--sb-gold-light)' }}>
              ACTIVE DECK
            </span>
            {deckTotal > 0 && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 8 }}>│</span>
                <span className="sb-mono" style={{ fontSize: 9, color: '#94a3b8' }}>⚔ {deckActions}</span>
                <span className="sb-mono" style={{ fontSize: 9, color: '#c084fc' }}>✦ {deckTactics}</span>
              </>
            )}
          </div>
          {deckTotal > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {/* emoji previews */}
              {previewEmojis.map((em, i) => (
                <span key={i} style={{ fontSize: 13, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}>
                  {em}
                </span>
              ))}
              {deckTotal > previewEmojis.length && (
                <span className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.35)', marginLeft: 1 }}>
                  +{deckTotal - previewEmojis.length}
                </span>
              )}
              {/* rarity pips */}
              <div style={{ display: 'flex', gap: 3, marginLeft: 4, alignItems: 'center' }}>
                {RARITY_PIPS.filter(r => deckRarity[r.key]).map(r => (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: r.color, boxShadow: `0 0 3px ${r.color}80` }} />
                    <span className="sb-mono" style={{ fontSize: 7, color: r.color, opacity: 0.85 }}>{deckRarity[r.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <span className="sb-display" style={{ fontSize: 8, color: 'rgba(255,235,180,0.25)', letterSpacing: '0.12em' }}>
              — NO DECK CONFIGURED —
            </span>
          )}
        </div>
        {/* Right: total + edit hint */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
          <span className="sb-mono" style={{ fontSize: 13, color: 'var(--sb-gold)', fontWeight: 800 }}>
            {deckTotal}
          </span>
          {onDeck && (
            <span className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.35)', letterSpacing: '0.08em' }}>
              EDIT ✎
            </span>
          )}
        </div>
      </button>

      {/* ── Stage grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, maxWidth: 600, margin: '0 auto' }}>
          {stages.map(s => (
            <StageCard
              key={s}
              stage={s}
              unlocked={s <= unlockedThrough}
              stars={profile.stageStars[s] ?? 0}
              isCurrent={s === unlockedThrough}
              onPick={() => onPick(s)}
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
  stage, unlocked, stars, isCurrent, onPick,
}: {
  stage: number;
  unlocked: boolean;
  stars: 0 | 1 | 2 | 3;
  isCurrent: boolean;
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
          : isBoss
            ? 'linear-gradient(160deg, rgba(127,29,29,0.6) 0%, rgba(60,12,12,0.7) 100%)'
            : 'linear-gradient(160deg, rgba(34,89,46,0.35) 0%, rgba(6,13,7,0.7) 100%)',
        border: `1.5px solid ${!unlocked
          ? 'rgba(255,255,255,0.06)'
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

      {/* Top: stage number + boss/lock icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.4)', letterSpacing: '0.15em', marginBottom: 1 }}>
            STAGE
          </div>
          <div className="sb-display" style={{ fontSize: 22, color: isBoss ? '#fca5a5' : 'var(--sb-gold-light)', lineHeight: 1 }}>
            {stage}
          </div>
        </div>
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>
          {!unlocked ? '🔒' : isBoss ? '👑' : ''}
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
