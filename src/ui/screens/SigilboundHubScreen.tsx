import type { Profile } from '@storage/index';
import { bpTierFromXp } from '@engine/index';
import DeckCarousel from '@ui/components/DeckCarousel';
import { useFullscreen } from '@ui/hooks/useFullscreen';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onCombat: () => void;
  onStronghold: () => void;
  onProfile: () => void;
  onSettings: () => void;
  onDeck: () => void;
  onShop: () => void;
  onEncyclopedia: () => void;
  onBattlePass?: () => void;
  onLeaderboard?: () => void;
}

export default function SigilboundHubScreen({
  profile, onProfileChange, onCombat, onStronghold, onProfile, onSettings, onDeck, onShop, onEncyclopedia, onBattlePass, onLeaderboard,
}: Props) {
  const stage = profile.currentStage ?? 1;
  const stageStars = profile.stageStars[stage] ?? 0;
  const fs = useFullscreen();

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
          {fs.supported && (
            <button
              onClick={fs.toggle}
              aria-label={fs.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={fs.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="ml-0.5 flex items-center justify-center flex-shrink-0"
              style={{
                width: 36, height: 36,
                borderRadius: '50%',
                background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
                border: '2px solid var(--sb-bronze)',
                color: 'var(--sb-gold-light)',
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.18), var(--sb-shadow-sm)',
              }}
            >
              {fs.isFullscreen ? '🗗' : '⛶'}
            </button>
          )}
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
            ROGUELITE · DECKBUILDING · BATTLE
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
            <BpProgressBar profile={profile} onOpen={onBattlePass} />
          </div>
        )}

        {/* Active deck — carousel with archetype + showcase + swipe / arrows */}
        <div className="w-full max-w-sm pointer-events-auto">
          <DeckCarousel
            profile={profile}
            onProfileChange={onProfileChange}
            onOpenDeck={onDeck}
          />
        </div>

        {/* Primary CTA + bottom group — shifted up 12px (was mt-2 / 8px,
            now -4px) so it sits closer to the deck carousel above. The
            parent flex column handles narrow-screen overflow gracefully. */}
        <div
          className="w-full max-w-sm flex flex-col gap-1.5 pointer-events-auto mb-1"
          style={{ marginTop: '-4px' }}
        >
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
      {/* Lifted 12px on screens taller than 600px so the dock sits closer to
          the action; on shorter screens we let the safe-bottom area handle it
          to avoid overlap with home-indicator gestures. */}
      <nav
        className="relative z-20 flex items-stretch justify-around gap-1 px-2 pb-3 pt-2 pointer-events-auto overflow-x-auto sb-bottom-dock"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <DockButton onClick={onDeck}         icon="🃏" label="Deck" />
        <DockButton onClick={onShop}         icon="⚜" label="Shop" />
        <DockButton onClick={onStronghold}   icon="🏰" label="Stronghold" />
        <DockButton onClick={onEncyclopedia} icon="📚" label="Cards" />
        {onLeaderboard && <DockButton onClick={onLeaderboard} icon="🏆" label="Scores" />}
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

function BpProgressBar({ profile, onOpen }: { profile: Profile; onOpen?: () => void }) {
  const currentXp = profile.bpXp ?? 0;
  const currentTier = bpTierFromXp(currentXp);
  const seasonNum = profile.bpSeasonNumber || 1;
  const TOTAL_TIERS = 60;
  const pct = Math.min(100, (currentTier / TOTAL_TIERS) * 100);

  return (
    <button
      onClick={onOpen}
      disabled={!onOpen}
      className="w-full rounded-lg p-3 text-left"
      style={{
        background: 'linear-gradient(135deg, rgba(167,139,250,0.15) 0%, rgba(76,29,149,0.18) 100%)',
        border: '1.5px solid rgba(167,139,250,0.4)',
        cursor: onOpen ? 'pointer' : 'default',
        boxShadow: 'inset 0 1px 0 rgba(196,181,253,0.12)',
        transition: 'all 200ms ease',
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{profile.bpPremium ? '👑' : '🎖️'}</span>
        <div className="flex-1 min-w-0">
          <div
            className="sb-display"
            style={{ fontSize: 11, color: '#e9d5ff', letterSpacing: '0.18em' }}
          >
            BATTLE PASS · S{seasonNum}
          </div>
          <div
            className="sb-mono"
            style={{ fontSize: 9, color: '#a78bfa', letterSpacing: '0.1em', opacity: 0.85 }}
          >
            TIER {currentTier} / {TOTAL_TIERS}
          </div>
        </div>
        {onOpen && (
          <span style={{ fontSize: 12, color: '#c4b5fd', opacity: 0.7 }}>›</span>
        )}
      </div>
      <div
        className="h-2 rounded-full overflow-hidden"
        style={{ background: 'rgba(0,0,0,0.5)', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6)' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #a78bfa 0%, #f472b6 50%, #fbbf24 100%)',
            boxShadow: '0 0 6px rgba(251,191,36,0.5)',
          }}
        />
      </div>
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
