import { useMemo } from 'react';
import type { Profile } from '@storage/index';
import { allActions, allTactics } from '@engine/index';

interface Props {
  profile: Profile;
  onCombat: () => void;
  onStronghold: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onDeck: () => void;
  onShop: () => void;
  onBestiary: () => void;
}

export default function SigilboundHubScreen({
  profile, onCombat, onStronghold, onProfile, onSettings, onDeck, onShop, onBestiary,
}: Props) {
  const stage = profile.currentStage ?? 1;
  const stageStars = profile.stageStars[stage] ?? 0;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full overflow-hidden flex flex-col safe-top safe-bottom">

      {/* === TOP BAR === */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-2 pt-3 pb-2 pointer-events-none">
        <button
          onClick={onProfile}
          className="flex items-center gap-2 pointer-events-auto"
          style={{
            background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
            border: '2px solid var(--sb-bronze)',
            borderRadius: '999px',
            padding: '4px 12px 4px 4px',
            color: 'var(--sb-gold-light)',
            cursor: 'pointer',
            boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.18), var(--sb-shadow-sm)',
          }}
        >
          <span
            className="flex items-center justify-center"
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)',
              fontSize: 18,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
            }}
          >
            {profile.avatarEmoji ?? '⚔'}
          </span>
          <span className="sb-display text-[10px]" style={{ letterSpacing: '0.15em' }}>
            {profile.displayName?.toUpperCase() ?? 'SIGILIST'}
          </span>
        </button>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <CurrencyChip icon="💰" value={profile.bankCoins} accent="var(--sb-gold)" />
          <CurrencyChip icon="💎" value={profile.gems} accent="#93c5fd" />
          <CurrencyChip icon="✨" value={profile.perkShards} accent="#c4b5fd" />
          <button
            onClick={onSettings}
            aria-label="Settings"
            className="ml-0.5 flex items-center justify-center flex-shrink-0"
            style={{
              width: 36, height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
              border: '2px solid var(--sb-bronze)',
              color: 'var(--sb-gold-light)',
              fontSize: 16,
              cursor: 'pointer',
              boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.18), var(--sb-shadow-sm)',
            }}
          >
            ⚙
          </button>
        </div>
      </div>

      {/* === CENTER HERO STACK === */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-4 pb-2 overflow-hidden">

        {/* Title */}
        <div className="text-center select-none sb-fade-up pt-3 pointer-events-none">
          <div
            className="text-6xl sm:text-7xl mb-1 inline-block"
            style={{
              filter: 'drop-shadow(0 6px 12px rgba(220,38,38,0.45)) drop-shadow(0 2px 4px rgba(0,0,0,0.7))',
              animation: 'sb-bob 4s ease-in-out infinite',
            }}
          >
            ⚔
          </div>
          <h1
            className="sb-display"
            style={{
              fontSize: 'clamp(38px, 11vw, 64px)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.18em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 0 24px rgba(251,191,36,0.35)',
              fontWeight: 900,
              lineHeight: 1,
              margin: 0,
            }}
          >
            SIGILBOUND
          </h1>
          <div
            className="sb-display mt-2"
            style={{
              fontSize: '10px',
              color: 'var(--sb-gold)',
              letterSpacing: '0.5em',
              opacity: 0.85,
            }}
          >
            BIND · STRIKE · CONQUER
          </div>
        </div>

        {/* Lifetime stats — small parchment plaque */}
        <div className="w-full max-w-sm pointer-events-auto">
          <div className="sb-parchment p-2.5 grid grid-cols-3 gap-2 text-center">
            <Stat label="Battles" value={profile.seasonsPlayed} />
            <Stat label="Best" value={profile.bestScore} />
            <Stat label="Sigil" value={profile.hr} />
          </div>
        </div>

        {/* Active deck HUD */}
        <div className="w-full max-w-sm pointer-events-auto">
          <DeckHud deck={profile.combatDeck} onDeckPress={onDeck} />
        </div>

        {/* Primary CTA + secondary row */}
        <div className="w-full max-w-sm flex flex-col gap-1.5 pointer-events-auto mt-2 mb-1">
          <button
            onClick={onCombat}
            className="sb-btn sb-pulse-crimson w-full"
            style={{ fontSize: '17px', padding: '16px 20px', letterSpacing: '0.18em' }}
          >
            <span className="flex flex-col items-center leading-tight">
              <span>▶ STAGE {stage}</span>
              <span
                className="sb-mono mt-1 opacity-85"
                style={{ fontSize: '10px', letterSpacing: '0.3em' }}
              >
                {stageStars > 0 ? `${'★'.repeat(stageStars)}${'☆'.repeat(3 - stageStars)} BEST` : 'BEGIN'}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* === BOTTOM DOCK === */}
      <nav
        className="relative z-20 flex items-stretch justify-around gap-1 px-2 pb-3 pt-2 pointer-events-auto"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <DockButton onClick={onDeck}       icon="🃏" label="Deck" />
        <DockButton onClick={onShop}       icon="⚜" label="Shop" />
        <DockButton onClick={onStronghold} icon="🏰" label="Stronghold" />
        <DockButton onClick={onBestiary}   icon="📖" label="Bestiary" />
      </nav>

      {/* version mark */}
      <div
        className="absolute bottom-0.5 left-2 z-30 sb-mono pointer-events-none"
        style={{ fontSize: '9px', opacity: 0.4, color: 'var(--sb-gold-light)' }}
      >
        v0.6.0 SIGILBOUND
      </div>
    </div>
  );
}

// ─── Deck HUD ────────────────────────────────────────────────────────────────
// Compact at-a-glance strip: card count, type breakdown, rarity pip row.
// Tapping anywhere opens the deck builder.

const RARITY_PIPS: Array<{ key: string; color: string }> = [
  { key: 'common',    color: '#94a3b8' },
  { key: 'uncommon',  color: '#4ade80' },
  { key: 'rare',      color: '#60a5fa' },
  { key: 'epic',      color: '#c084fc' },
  { key: 'legendary', color: '#fbbf24' },
  { key: 'mythic',    color: '#f87171' },
];

function DeckHud({ deck, onDeckPress }: { deck: string[]; onDeckPress: () => void }) {
  const allCardDefs = useMemo(() => {
    const actions = allActions();
    const tactics = allTactics();
    return new Map([...actions, ...tactics].map(c => [c.id, c]));
  }, []);

  const cards = deck.map(id => allCardDefs.get(id)).filter(Boolean) as Array<{ id: string; type: string; rarity: string; name: string; emoji?: string }>;
  const totalCards = cards.length;
  const actionCount = cards.filter(c => c.type === 'action').length;
  const tacticCount = cards.filter(c => c.type === 'tactic').length;

  const rarityCounts = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.rarity] = (acc[c.rarity] ?? 0) + 1;
    return acc;
  }, {});

  // Preview: up to 6 unique card emojis
  const previewEmojis = [...new Map(cards.filter(c => c.emoji).map(c => [c.id, c.emoji])).values()].slice(0, 6) as string[];

  const isEmpty = totalCards === 0;

  return (
    <button
      onClick={onDeckPress}
      style={{
        width: '100%',
        background: 'linear-gradient(180deg, rgba(44,24,16,0.85) 0%, rgba(20,12,8,0.9) 100%)',
        border: '1.5px solid var(--sb-bronze-dark)',
        borderRadius: 10,
        padding: '8px 12px',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.1), var(--sb-shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      {/* Row 1: label + count + edit hint */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>🃏</span>
          <span className="sb-display" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--sb-gold-light)' }}>
            ACTIVE DECK
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isEmpty && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span className="sb-mono" style={{ fontSize: 10, color: '#94a3b8' }}>
                ⚔ {actionCount}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>│</span>
              <span className="sb-mono" style={{ fontSize: 10, color: '#c084fc' }}>
                ✦ {tacticCount}
              </span>
            </div>
          )}
          <span className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em' }}>
            {isEmpty ? 'TAP TO BUILD →' : `${totalCards} CARDS  ✎`}
          </span>
        </div>
      </div>

      {isEmpty ? (
        <div style={{ textAlign: 'center', padding: '4px 0' }}>
          <span className="sb-display" style={{ fontSize: 9, color: 'rgba(255,235,180,0.3)', letterSpacing: '0.15em' }}>
            — NO DECK CONFIGURED —
          </span>
        </div>
      ) : (
        <>
          {/* Row 2: card emoji preview */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {previewEmojis.map((em, i) => (
              <span
                key={i}
                style={{
                  fontSize: 15,
                  lineHeight: 1,
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
                  opacity: 0.9,
                }}
              >
                {em}
              </span>
            ))}
            {totalCards > previewEmojis.length && (
              <span className="sb-mono" style={{ fontSize: 9, color: 'rgba(255,235,180,0.4)', marginLeft: 2 }}>
                +{totalCards - previewEmojis.length}
              </span>
            )}
          </div>

          {/* Row 3: rarity pip bar */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {RARITY_PIPS.filter(r => rarityCounts[r.key]).map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: r.color,
                  boxShadow: `0 0 4px ${r.color}80`,
                  flexShrink: 0,
                }} />
                <span className="sb-mono" style={{ fontSize: 8, color: r.color, opacity: 0.85 }}>
                  {rarityCounts[r.key]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CurrencyChip({ icon, value, accent }: { icon: string; value: number; accent: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1"
      style={{
        background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: `1.5px solid ${accent}`,
        borderRadius: '999px',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.18), var(--sb-shadow-sm)',
      }}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="sb-mono font-bold" style={{ fontSize: '11px', color: accent }}>
        {abbreviate(value)}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div
        className="sb-display"
        style={{ fontSize: '8px', letterSpacing: '0.18em', color: 'var(--sb-gold-dark)' }}
      >
        {label.toUpperCase()}
      </div>
      <div className="sb-mono font-bold" style={{ fontSize: '13px', color: '#2c1810' }}>
        {value}
      </div>
    </div>
  );
}

interface DockBtnProps {
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number | string;
  highlight?: boolean;
  disabled?: boolean;
}

function DockButton({ onClick, icon, label, badge, highlight, disabled }: DockBtnProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 relative"
      style={{
        background: highlight
          ? 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)'
          : 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: highlight ? '2px solid var(--sb-gold)' : '2px solid var(--sb-bronze-dark)',
        borderRadius: '6px',
        color: 'var(--sb-gold-light)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        boxShadow: highlight
          ? 'inset 0 1px 0 rgba(255,235,180,0.4), 0 0 12px rgba(251,191,36,0.35), var(--sb-shadow-sm)'
          : 'inset 0 1px 0 rgba(255,200,140,0.15), var(--sb-shadow-sm)',
        minHeight: 56,
        userSelect: 'none',
      }}
    >
      <span
        className="text-xl leading-none"
        style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}
      >
        {icon}
      </span>
      <span
        className="sb-display"
        style={{ fontSize: '9px', letterSpacing: '0.12em', textShadow: '0 1px 1px rgba(0,0,0,0.6)' }}
      >
        {label.toUpperCase()}
      </span>
      {badge !== undefined && badge !== 0 && (
        <span
          className="sb-mono absolute -top-1 -right-1"
          style={{
            background: 'var(--sb-gold)',
            color: 'var(--sb-shadow)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: '999px',
            fontSize: '9px',
            padding: '1px 5px',
            minWidth: 16,
            fontWeight: 800,
            boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
          }}
        >
          {abbreviate(typeof badge === 'number' ? badge : 0) || badge}
        </span>
      )}
    </button>
  );
}

function abbreviate(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
