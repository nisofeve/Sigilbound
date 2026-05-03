import { useMemo, useState } from 'react';
import type { Profile } from '@storage/index';
import { setActiveCombatDeckSet } from '@storage/index';
import { allActions, allTactics, bpTierFromXp } from '@engine/index';
import DailyChallengesPanel from '@ui/components/DailyChallengesPanel';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onCombat: () => void;
  onStronghold: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onDeck: () => void;
  onShop: () => void;
  onBestiary: () => void;
  onEncyclopedia: () => void;
  onLeaderboard?: () => void;
  onLore?: () => void;
  onCardUpgrade?: () => void;
}

export default function SigilboundHubScreen({
  profile, onProfileChange, onCombat, onStronghold, onProfile, onSettings, onDeck, onShop, onBestiary, onEncyclopedia, onLeaderboard, onLore, onCardUpgrade,
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

        {/* Battle Pass Progress */}
        {profile.bpXp !== undefined && (
          <div className="w-full max-w-sm pointer-events-auto">
            <BpProgressBar profile={profile} />
          </div>
        )}

        {/* Daily Challenges */}
        <div className="w-full max-w-sm pointer-events-auto">
          <DailyChallengesPanel profile={profile} />
        </div>

        {/* Active deck HUD */}
        <div className="w-full max-w-sm pointer-events-auto">
          <DeckHud profile={profile} onProfileChange={onProfileChange} onDeckPress={onDeck} />
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
        className="relative z-20 flex items-stretch justify-around gap-1 px-2 pb-3 pt-2 pointer-events-auto overflow-x-auto"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <DockButton onClick={onDeck}         icon="🃏" label="Deck" />
        <DockButton onClick={onShop}         icon="⚜" label="Shop" />
        <DockButton onClick={onStronghold}   icon="🏰" label="Stronghold" />
        <DockButton onClick={onBestiary}     icon="📖" label="Bestiary" />
        <DockButton onClick={onEncyclopedia} icon="📚" label="Cards" />
        {onLeaderboard && <DockButton onClick={onLeaderboard} icon="🏆" label="Scores" />}
        {onLore && <DockButton onClick={onLore} icon="📜" label="Lore" />}
        {onCardUpgrade && <DockButton onClick={onCardUpgrade} icon="⚙" label="Upgrades" />}
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

// ─── Battle Pass Progress ──────────────────────────────────────────────────

function BpProgressBar({ profile }: { profile: Profile }) {
  const currentXp = profile.bpXp ?? 0;
  const currentTier = bpTierFromXp(currentXp);
  const seasonNum = profile.bpSeasonNumber ?? 1;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'linear-gradient(135deg, rgba(255,193,7,0.08) 0%, rgba(255,152,0,0.04) 100%)',
        border: '1.5px solid rgba(255,193,7,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">🎖️</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-extrabold">Battle Pass S{seasonNum}</div>
          <div className="text-[10px] opacity-60">Tier {currentTier} / 40</div>
        </div>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${(currentTier / 40) * 100}%`,
            background: 'linear-gradient(90deg, #ffd54f 0%, #ff9800 100%)',
          }}
        />
      </div>
    </div>
  );
}

// ─── Deck HUD ────────────────────────────────────────────────────────────────

const RARITY_COLOR_MAP: Record<string, string> = {
  common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa',
  epic: '#c084fc', legendary: '#fbbf24', mythic: '#f87171',
};

function DeckHud({
  profile,
  onProfileChange,
  onDeckPress,
}: {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onDeckPress: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const allCardDefs = useMemo(() => {
    const actions = allActions();
    const tactics = allTactics();
    return new Map([...actions, ...tactics].map(c => [c.id, c]));
  }, []);

  const activeSetIdx = profile.activeCombatDeckSet ?? 0;
  const deck = profile.combatDeck ?? [];
  const sets = profile.combatDeckSets ?? [];

  const cards = deck.map(id => allCardDefs.get(id)).filter(Boolean) as Array<{ id: string; type: string; rarity: string; name: string }>;
  const totalCards = cards.length;
  const actionCount = cards.filter(c => c.type === 'action').length;
  const tacticCount = cards.filter(c => c.type === 'tactic').length;
  const isEmpty = totalCards === 0;

  // Unique card name counts for the list
  const cardNameCounts = useMemo(() => {
    const m = new Map<string, { name: string; rarity: string; type: string; count: number }>();
    for (const c of cards) {
      if (m.has(c.id)) { m.get(c.id)!.count++; }
      else m.set(c.id, { name: c.name, rarity: c.rarity, type: c.type, count: 1 });
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [cards]);

  return (
    <div style={{
      width: '100%',
      background: 'linear-gradient(180deg, rgba(44,24,16,0.88) 0%, rgba(20,12,8,0.93) 100%)',
      border: '1.5px solid var(--sb-bronze-dark)',
      borderRadius: 10,
      overflow: 'hidden',
      boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.1), var(--sb-shadow-sm)',
    }}>
      {/* Header row — always visible */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>🃏</span>
          <span className="sb-display" style={{ fontSize: 9, letterSpacing: '0.2em', color: 'var(--sb-gold-light)' }}>
            {sets[activeSetIdx]?.name?.toUpperCase() ?? 'ACTIVE DECK'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isEmpty && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span className="sb-mono" style={{ fontSize: 10, color: '#94a3b8' }}>⚔ {actionCount}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>│</span>
              <span className="sb-mono" style={{ fontSize: 10, color: '#c084fc' }}>✦ {tacticCount}</span>
            </div>
          )}
          <span className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.7, letterSpacing: '0.1em' }}>
            {isEmpty ? 'EMPTY' : `${totalCards}`} {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Set switcher */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
            {sets.map((s, i) => (
              <button
                key={i}
                onClick={() => onProfileChange(setActiveCombatDeckSet(profile, i))}
                style={{
                  flexShrink: 0,
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: 9,
                  fontWeight: 800,
                  fontFamily: "'Nunito', sans-serif",
                  letterSpacing: '0.05em',
                  background: i === activeSetIdx ? 'rgba(196,146,42,0.22)' : 'rgba(0,0,0,0.2)',
                  border: i === activeSetIdx ? '1.5px solid rgba(196,146,42,0.7)' : '1.5px solid rgba(120,80,30,0.2)',
                  color: i === activeSetIdx ? '#c4922a' : '#8d6e3f',
                  cursor: 'pointer',
                }}
              >
                {s.name ?? `Deck ${i + 1}`}
                <span style={{ opacity: 0.6, marginLeft: 3 }}>({s.cards?.length ?? 0})</span>
              </button>
            ))}
          </div>

          {/* Card list */}
          {isEmpty ? (
            <div style={{ textAlign: 'center', padding: '4px 0' }}>
              <span className="sb-display" style={{ fontSize: 9, color: 'rgba(255,235,180,0.3)', letterSpacing: '0.15em' }}>— NO CARDS —</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
              {cardNameCounts.map((entry, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: RARITY_COLOR_MAP[entry.rarity] ?? '#94a3b8',
                    boxShadow: `0 0 4px ${RARITY_COLOR_MAP[entry.rarity] ?? '#94a3b8'}80`,
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
              ))}
            </div>
          )}

          {/* Edit button */}
          <button
            onClick={onDeckPress}
            style={{
              width: '100%',
              padding: '5px 0',
              borderRadius: 6,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.15em',
              fontFamily: "'Nunito', sans-serif",
              background: 'rgba(196,146,42,0.15)',
              border: '1.5px solid rgba(196,146,42,0.4)',
              color: 'var(--sb-gold-light)',
              cursor: 'pointer',
            }}
          >
            ✎ EDIT DECK
          </button>
        </div>
      )}
    </div>
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
