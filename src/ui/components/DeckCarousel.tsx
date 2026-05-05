// Shared "active deck" UI used on the hub, stage select, and combat home.
//
// Shows: archetype label + brief summary, three "best" card visuals (real
// CombatCards with proper artwork via the image manifest), prev/next arrows.
// Players can switch between deck sets via arrow taps or by swiping left/right.
// Tapping the body (anywhere outside the arrows) opens the deck management
// screen.

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  allActions,
  allTactics,
  type ActionCardDef,
  type TacticCardDef,
} from '@engine/index';
import { setActiveCombatDeckSet, type Profile } from '@storage/index';
import { CombatCard, type AnyCombatCard } from '@ui/components/CombatCard';

type CardDef = ActionCardDef | TacticCardDef;

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onOpenDeck: () => void;
}

const RARITY_RANK: Record<string, number> = {
  common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
};

// Quick-and-dirty archetype detector based on the loadout's cards.
function classifyDeck(cards: CardDef[]): { tag: string; summary: string } {
  if (cards.length === 0) return { tag: 'EMPTY', summary: 'No cards selected — tap to build.' };

  const total = cards.length;
  const actions = cards.filter((c): c is ActionCardDef => c.type === 'action');
  const tactics = cards.filter((c): c is TacticCardDef => c.type === 'tactic');

  // Damage-type distribution (only for actions).
  const dtCounts: Record<string, number> = {};
  for (const c of actions) {
    if (c.damageType) dtCounts[c.damageType] = (dtCounts[c.damageType] ?? 0) + 1;
  }
  const dominantType = Object.entries(dtCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const dtLabel: Record<string, string> = {
    physical: 'Steel', fire: 'Pyre', ice: 'Frost',
    thunder: 'Storm', dark: 'Shadow', holy: 'Radiant', nature: 'Verdant',
  };

  const tacticRatio = tactics.length / total;
  const avgDamage = actions.length > 0
    ? actions.reduce((s, c) => s + (c.damage ?? 0), 0) / actions.length
    : 0;

  let tag = 'BALANCED';
  let summary = 'A flexible mix of strikes and tactics.';

  if (tacticRatio >= 0.45) {
    tag = 'CONTROL';
    summary = `Tactic-heavy deck — outlasts the enemy with ${tactics.length} tactics.`;
  } else if (avgDamage >= 150 && actions.length >= total * 0.6) {
    tag = 'AGGRO';
    summary = `High-damage assault. Average strike: ${Math.round(avgDamage)} dmg.`;
  } else if (dominantType && (dtCounts[dominantType] ?? 0) >= actions.length * 0.55) {
    tag = `${(dtLabel[dominantType] ?? dominantType).toUpperCase()} FOCUS`;
    summary = `${dtCounts[dominantType]} ${dtLabel[dominantType] ?? dominantType} cards drive your damage.`;
  } else if (tacticRatio <= 0.15 && actions.length >= 8) {
    tag = 'OFFENSIVE';
    summary = `Pure strike deck — ${actions.length} action cards.`;
  }

  return { tag, summary };
}

// Returns the top 3 "best" cards: highest rarity, then highest damage (actions
// only), then alphabetical. Distinct ids only.
function pickShowcase(cards: CardDef[]): CardDef[] {
  const dedup = new Map<string, CardDef>();
  for (const c of cards) if (!dedup.has(c.id)) dedup.set(c.id, c);
  const ranked = [...dedup.values()].sort((a, b) => {
    const r = (RARITY_RANK[b.rarity] ?? 0) - (RARITY_RANK[a.rarity] ?? 0);
    if (r !== 0) return r;
    const ad = a.type === 'action' ? a.damage : 0;
    const bd = b.type === 'action' ? b.damage : 0;
    if (bd !== ad) return bd - ad;
    return a.name.localeCompare(b.name);
  });
  return ranked.slice(0, 3);
}

export default function DeckCarousel({ profile, onProfileChange, onOpenDeck }: Props) {
  const allCardDefs = useMemo(() => {
    const m = new Map<string, CardDef>();
    for (const c of allActions()) m.set(c.id, c);
    for (const c of allTactics()) m.set(c.id, c);
    return m;
  }, []);

  const sets = profile.combatDeckSets ?? [];
  const activeSetIdx = profile.activeCombatDeckSet ?? 0;
  const setCount = sets.length;

  // Track the showcase card width responsively. The carousel adapts to its
  // container width: tiny (≤320px) → 64px cards, normal → 80px cards.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cardWidth, setCardWidth] = useState(80);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        // 3 showcase cards + counts column → pick a card width that fits.
        // Reserve ~95px for counts + gaps, divide remainder by 3.
        const available = Math.max(150, w - 28); // outer padding
        const counts = 100;
        const gap = 12;
        const perCard = Math.floor((available - counts - gap * 3) / 3);
        const next = Math.max(56, Math.min(96, perCard));
        setCardWidth(next);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function switchTo(idx: number) {
    if (idx === activeSetIdx || idx < 0 || idx >= setCount) return;
    onProfileChange(setActiveCombatDeckSet(profile, idx));
  }

  function prev() {
    if (setCount <= 1) return;
    switchTo((activeSetIdx - 1 + setCount) % setCount);
  }
  function next() {
    if (setCount <= 1) return;
    switchTo((activeSetIdx + 1) % setCount);
  }

  // Touch / swipe handling — tracked via refs so we don't re-render mid-swipe.
  const touchStartX = useRef<number | null>(null);
  const touchMoved = useRef(false);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchMoved.current = false;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current == null) return;
    const dx = (e.touches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(dx) > 12) touchMoved.current = true;
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const endX = e.changedTouches[0]?.clientX ?? start;
    const dx = endX - start;
    if (Math.abs(dx) > 40) {
      if (dx < 0) next(); else prev();
    }
  }

  function onBodyClick() {
    if (touchMoved.current) return; // swallow click after a swipe
    onOpenDeck();
  }

  // Card list for the active set.
  const activeSet = sets[activeSetIdx];
  const cards = (activeSet?.cards ?? [])
    .map(id => allCardDefs.get(id))
    .filter((c): c is CardDef => Boolean(c));

  const totalCards = cards.length;
  const actionCount = cards.filter(c => c.type === 'action').length;
  const tacticCount = cards.filter(c => c.type === 'tactic').length;
  const archetype = useMemo(() => classifyDeck(cards), [cards]);
  const showcase = useMemo(() => pickShowcase(cards), [cards]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, rgba(44,24,16,0.92) 0%, rgba(20,12,8,0.95) 100%)',
        border: '1.5px solid var(--sb-bronze-dark)',
        borderRadius: 10,
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.12), var(--sb-shadow-sm)',
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Header: arrows + active set name + set indicator */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr 32px',
        alignItems: 'center',
        padding: '6px 4px 4px',
        borderBottom: '1px solid rgba(255,200,140,0.08)',
      }}>
        <ArrowButton direction="left" onClick={prev} disabled={setCount <= 1} />
        <button
          onClick={onBodyClick}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            padding: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}
        >
          <span className="sb-display" style={{
            fontSize: 10, letterSpacing: '0.22em', color: 'var(--sb-gold-light)',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}>
            🃏 {(activeSet?.name ?? `DECK ${activeSetIdx + 1}`).toUpperCase()}
          </span>
          {setCount > 1 && (
            <DotIndicator current={activeSetIdx} total={setCount} />
          )}
        </button>
        <ArrowButton direction="right" onClick={next} disabled={setCount <= 1} />
      </div>

      {/* Body: archetype tag + summary + showcase cards */}
      <div
        onClick={onBodyClick}
        style={{
          width: '100%',
          cursor: 'pointer',
          padding: '8px 12px 10px',
          textAlign: 'left',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {/* Archetype + summary row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 4,
            background: 'linear-gradient(180deg, rgba(220,38,38,0.30) 0%, rgba(127,29,29,0.30) 100%)',
            border: '1px solid rgba(252,165,165,0.55)',
            fontFamily: "'Cinzel', serif",
            fontSize: 9.5,
            fontWeight: 700,
            color: '#fecaca',
            letterSpacing: '0.18em',
            flexShrink: 0,
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}>
            {archetype.tag}
          </span>
          <div style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: 10,
            fontWeight: 600,
            color: '#e2d5b0',
            opacity: 0.9,
            lineHeight: 1.35,
            flex: 1,
            minWidth: 0,
          }}>
            {archetype.summary}
          </div>
        </div>

        {/* Showcase + counts */}
        {showcase.length > 0 ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {showcase.map(card => (
              <CardThumb key={card.id} card={card} width={cardWidth} />
            ))}
            {Array.from({ length: 3 - showcase.length }).map((_, i) => (
              <EmptyCardThumb key={`empty-${i}`} width={cardWidth} />
            ))}
            <div style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 4,
              padding: '0 2px',
            }}>
              <CountRow icon="🃏" label="TOTAL" value={totalCards} accent="var(--sb-gold)" />
              <CountRow icon="⚔" label="ACTION" value={actionCount} accent="#94a3b8" />
              <CountRow icon="✦" label="TACTIC" value={tacticCount} accent="#c084fc" />
            </div>
          </div>
        ) : (
          <div style={{
            padding: '14px 0',
            textAlign: 'center',
            border: '1px dashed rgba(255,200,140,0.18)',
            borderRadius: 6,
            color: 'rgba(255,235,180,0.5)',
            fontFamily: "'Cinzel', serif",
            fontSize: 10,
            letterSpacing: '0.2em',
          }}>
            EMPTY DECK · TAP TO BUILD
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function CardThumb({ card, width }: { card: CardDef; width: number }) {
  // Wrap CombatCard so a click anywhere on the thumb still opens the deck
  // screen (the body's onClick handler bubbles up). CombatCard itself accepts
  // pointer events; we leave them undefined so the parent owns interactions.
  return (
    <div style={{ flexShrink: 0, pointerEvents: 'none' }}>
      <CombatCard card={card as AnyCombatCard} customWidth={width} size="xs" />
    </div>
  );
}

function EmptyCardThumb({ width }: { width: number }) {
  // Match CombatCard's xs aspect ratio (84:118 ≈ 0.71).
  const height = Math.round(width * (118 / 84));
  return (
    <div
      style={{
        width,
        height,
        flexShrink: 0,
        borderRadius: 7,
        background: 'rgba(0,0,0,0.25)',
        border: '1px dashed rgba(255,200,140,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,235,180,0.25)',
        fontSize: 14,
      }}
    >
      —
    </div>
  );
}

function ArrowButton({ direction, onClick, disabled }: {
  direction: 'left' | 'right';
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={disabled}
      aria-label={direction === 'left' ? 'Previous deck' : 'Next deck'}
      style={{
        width: 28, height: 28,
        margin: '0 auto',
        borderRadius: '50%',
        background: disabled
          ? 'rgba(0,0,0,0.18)'
          : 'linear-gradient(180deg, rgba(196,146,42,0.30) 0%, rgba(85,55,15,0.45) 100%)',
        border: `1px solid ${disabled ? 'rgba(120,80,30,0.2)' : 'rgba(196,146,42,0.55)'}`,
        color: disabled ? 'rgba(255,235,180,0.25)' : 'var(--sb-gold-light)',
        fontSize: 14,
        fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 200ms ease',
        boxShadow: disabled ? 'none' : 'inset 0 1px 0 rgba(255,200,140,0.18)',
      }}
    >
      {direction === 'left' ? '‹' : '›'}
    </button>
  );
}

function DotIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: i === current ? 10 : 4,
            height: 4,
            borderRadius: 2,
            background: i === current ? 'var(--sb-gold)' : 'rgba(255,235,180,0.25)',
            transition: 'width 200ms ease',
          }}
        />
      ))}
    </div>
  );
}

function CountRow({ icon, label, value, accent }: {
  icon: string; label: string; value: number; accent: string;
}) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 9,
      fontFamily: "'Nunito', sans-serif",
    }}>
      <span style={{ fontSize: 10, color: accent, flexShrink: 0 }}>{icon}</span>
      <span style={{
        flex: 1,
        color: 'rgba(255,235,180,0.55)',
        letterSpacing: '0.12em',
        fontWeight: 700,
        fontSize: 8,
      }}>
        {label}
      </span>
      <span className="sb-mono" style={{
        color: accent,
        fontWeight: 800,
        fontSize: 10,
        flexShrink: 0,
      }}>
        {value}
      </span>
    </div>
  );
}
