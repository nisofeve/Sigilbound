import { useMemo, useRef, useState } from 'react';
import type { Profile } from '@storage/index';
import { setActiveCombatDeckSet } from '@storage/index';
import { getStageDef, allActions, allTactics, MAX_STAGES, isHardmodeUnlocked } from '@engine/index';
import type { ActionCardDef, TacticCardDef } from '@engine/index';
import { CardDetailModal } from '../components/CardDetailBody';

interface Props {
  profile: Profile;
  onProfileChange?: (next: Profile) => void;
  onPick: (stage: number, hardmode?: boolean) => void;
  onBack: () => void;
  onDeck?: () => void;
}

const PAGE_SIZE = 20;

const RARITY_COLOR_SS: Record<string, string> = {
  common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa',
  epic: '#c084fc', legendary: '#fbbf24', mythic: '#f87171',
};

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

  const [deckExpanded, setDeckExpanded] = useState(false);
  const [hardmode, setHardmode] = useState(false);
  const [cardDetail, setCardDetail] = useState<ActionCardDef | TacticCardDef | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startCardLongPress(def: ActionCardDef | TacticCardDef) {
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      setCardDetail(def);
    }, 500);
  }
  function cancelCardLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const allCardDefs = useMemo(() => {
    const actions = allActions();
    const tactics = allTactics();
    return new Map([...actions, ...tactics].map(c => [c.id, c]));
  }, []);

  // Name → def lookup for long-press detail (cardNameCounts uses name, not id).
  const cardDefByName = useMemo(() => {
    const m = new Map<string, ActionCardDef | TacticCardDef>();
    for (const [, def] of allCardDefs) m.set(def.name, def as ActionCardDef | TacticCardDef);
    return m;
  }, [allCardDefs]);

  const activeSetIdx = profile.activeCombatDeckSet ?? 0;
  const deckCards = (profile.combatDeck ?? [])
    .map(id => allCardDefs.get(id))
    .filter(Boolean) as Array<{ id: string; type: string; rarity: string; name: string }>;

  const deckTotal = deckCards.length;
  const deckActions = deckCards.filter(c => c.type === 'action').length;
  const deckTactics = deckCards.filter(c => c.type === 'tactic').length;

  const cardNameCounts = useMemo(() => {
    const m = new Map<string, { name: string; rarity: string; type: string; count: number }>();
    for (const c of deckCards) {
      if (m.has(c.id)) { m.get(c.id)!.count++; }
      else m.set(c.id, { name: c.name, rarity: c.rarity, type: c.type, count: 1 });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [deckCards]);

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
            ⚔ STAGES {hardmode && profile.hardmodeUnlockedThrough > 0 && '🔥'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {profile.hardmodeUnlockedThrough > 0 && (
            <button
              onClick={() => setHardmode(!hardmode)}
              style={{
                background: hardmode
                  ? 'linear-gradient(180deg, rgba(248,113,113,0.3) 0%, rgba(127,29,29,0.4) 100%)'
                  : 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
                border: hardmode ? '1.5px solid #f87171' : '1.5px solid var(--sb-bronze-dark)',
                borderRadius: 8,
                color: hardmode ? '#fca5a5' : 'var(--sb-gold-light)',
                padding: '6px 10px',
                cursor: 'pointer',
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.75rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                transition: 'all 140ms ease',
              }}
            >
              {hardmode ? '🔥 HARD' : 'NORM'}
            </button>
          )}
          <div
            className="sb-mono"
            style={{ fontSize: '0.7rem', color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em', minWidth: 52, textAlign: 'right' }}
          >
            {unlockedThrough}/{MAX_STAGES}
          </div>
        </div>
      </div>

      {/* ── Deck HUD strip ── */}
      <div style={{
        flexShrink: 0,
        margin: '8px 16px 4px',
        background: 'linear-gradient(180deg, rgba(44,24,16,0.88) 0%, rgba(20,12,8,0.93) 100%)',
        border: '1.5px solid var(--sb-bronze-dark)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.08)',
      }}>
        {/* Header row */}
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', cursor: 'pointer', gap: 10 }}
          onClick={() => setDeckExpanded(v => !v)}
        >
          <span style={{ fontSize: 12 }}>🃏</span>
          <span className="sb-display" style={{ fontSize: 8, letterSpacing: '0.2em', color: 'var(--sb-gold-light)', flex: 1 }}>
            {(profile.combatDeckSets ?? [])[activeSetIdx]?.name?.toUpperCase() ?? 'ACTIVE DECK'}
          </span>
          {deckTotal > 0 && (
            <>
              <span className="sb-mono" style={{ fontSize: 9, color: '#94a3b8' }}>⚔ {deckActions}</span>
              <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 8 }}>│</span>
              <span className="sb-mono" style={{ fontSize: 9, color: '#c084fc' }}>✦ {deckTactics}</span>
            </>
          )}
          <span className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.7 }}>
            {deckTotal > 0 ? `${deckTotal}` : 'EMPTY'} {deckExpanded ? '▲' : '▼'}
          </span>
        </div>

        {/* Expanded panel */}
        {deckExpanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* Set switcher */}
            {(profile.combatDeckSets ?? []).length > 0 && (
              <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
                {(profile.combatDeckSets ?? []).map((s, i) => (
                  <button
                    key={i}
                    onClick={() => onProfileChange && onProfileChange(setActiveCombatDeckSet(profile, i))}
                    disabled={!onProfileChange}
                    style={{
                      flexShrink: 0, padding: '3px 8px', borderRadius: 6,
                      fontSize: 9, fontWeight: 800, fontFamily: "'Nunito', sans-serif",
                      background: i === activeSetIdx ? 'rgba(196,146,42,0.22)' : 'rgba(0,0,0,0.2)',
                      border: i === activeSetIdx ? '1.5px solid rgba(196,146,42,0.7)' : '1.5px solid rgba(120,80,30,0.2)',
                      color: i === activeSetIdx ? '#c4922a' : '#8d6e3f',
                      cursor: onProfileChange ? 'pointer' : 'default',
                    }}
                  >
                    {s.name ?? `Deck ${i + 1}`}
                    <span style={{ opacity: 0.6, marginLeft: 3 }}>({s.cards?.length ?? 0})</span>
                  </button>
                ))}
              </div>
            )}

            {/* Card list */}
            {deckTotal === 0 ? (
              <span className="sb-display" style={{ fontSize: 8, color: 'rgba(255,235,180,0.25)', letterSpacing: '0.12em', textAlign: 'center' }}>
                — NO DECK CONFIGURED —
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 160, overflowY: 'auto' }}>
                {cardNameCounts.map((entry, i) => {
                  const def = cardDefByName.get(entry.name);
                  return (
                    <div
                      key={i}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, touchAction: 'none', userSelect: 'none' }}
                      onPointerDown={() => def && startCardLongPress(def)}
                      onPointerUp={cancelCardLongPress}
                      onPointerLeave={cancelCardLongPress}
                      onPointerCancel={cancelCardLongPress}
                    >
                      <div style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: RARITY_COLOR_SS[entry.rarity] ?? '#94a3b8',
                        boxShadow: `0 0 4px ${RARITY_COLOR_SS[entry.rarity] ?? '#94a3b8'}80`,
                      }} />
                      <span className="sb-mono" style={{ fontSize: 9, color: '#e2d5b0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name}
                      </span>
                      <span style={{ fontSize: 8, color: entry.type === 'action' ? '#94a3b8' : '#c084fc', flexShrink: 0 }}>
                        {entry.type === 'action' ? '⚔' : '✦'}
                      </span>
                      <span className="sb-mono" style={{ fontSize: 9, color: '#c4922a', flexShrink: 0, minWidth: 16, textAlign: 'right' }}>
                        ×{entry.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Edit button */}
            {onDeck && (
              <button
                onClick={onDeck}
                style={{
                  width: '100%', padding: '5px 0', borderRadius: 6,
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.15em',
                  fontFamily: "'Nunito', sans-serif",
                  background: 'rgba(196,146,42,0.15)',
                  border: '1.5px solid rgba(196,146,42,0.4)',
                  color: 'var(--sb-gold-light)',
                  cursor: 'pointer',
                }}
              >
                ✎ EDIT DECK
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Stage grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 12px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, maxWidth: 600, margin: '0 auto' }}>
          {stages.map(s => (
            <StageCard
              key={s}
              stage={s}
              unlocked={hardmode ? isHardmodeUnlocked(s, profile.hardmodeUnlockedThrough) : s <= unlockedThrough}
              stars={hardmode ? (profile.hardmodeStageStars[s] ?? 0) : (profile.stageStars[s] ?? 0)}
              isCurrent={hardmode ? false : s === unlockedThrough}
              isHardmode={hardmode}
              onPick={() => onPick(s, hardmode)}
            />
          ))}
        </div>
      </div>

      {/* ── Card detail modal (long-press on deck card rows) ── */}
      {cardDetail && (
        <CardDetailModal
          target={{ kind: 'battle', card: cardDetail }}
          onClose={() => setCardDetail(null)}
        />
      )}

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
