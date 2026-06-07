import { useState } from 'react';
import { sfx } from '@game/sfx';
import type { Profile } from '@storage/index';
import type { AuthStatus } from '@firebase-app/auth';
import {
  allBpTiers, allQuests, bpTierFromXp,
  levelProgress, levelFromXp, monthKey,
  selectPeriodicQuests, todayKey, upgradesUnlockedAtLevel,
  weekKey, type Quest,
} from '@engine/index';

const STRONGHOLD_SEEN_LEVEL_KEY = 'sb_stronghold_seen_level';

function countBpClaimable(profile: Profile): number {
  const tiers = allBpTiers();
  const currentTier = bpTierFromXp(profile.bpXp);
  const freeClaim = tiers.filter(t => t.free && currentTier >= t.tier && !profile.bpClaimedFree.includes(t.tier)).length;
  const premClaim = profile.bpPremium
    ? tiers.filter(t => t.premium && currentTier >= t.tier && !profile.bpClaimedPremium.includes(t.tier)).length
    : 0;

  const today = todayKey();
  const week = weekKey();
  const month = monthKey();
  const dailyState = profile.todayQuestsISO === today ? profile.todayQuestsState : {};
  const weeklyState = profile.weekQuestsISO === week ? profile.weekQuestsState : {};
  const monthlyState = profile.monthQuestsISO === month ? profile.monthQuestsState : {};

  const countC = (qs: Quest[], s: Record<string, { progress: number; claimed: boolean }>) =>
    qs.filter(q => { const e = s[q.id]; return e && e.progress >= q.goal && !e.claimed; }).length;

  return freeClaim + premClaim
    + countC(selectPeriodicQuests('daily', today), dailyState)
    + countC(selectPeriodicQuests('weekly', week), weeklyState)
    + countC(selectPeriodicQuests('monthly', month), monthlyState);
}

function hasNewStrongholdUpgrades(profile: Profile): boolean {
  const playerLevel = levelFromXp(profile.playerXp);
  try {
    const seen = parseInt(localStorage.getItem(STRONGHOLD_SEEN_LEVEL_KEY) ?? '0', 10);
    if (playerLevel <= seen) return false;
    // Check if any level between seen+1 and playerLevel unlocks upgrades.
    for (let lv = seen + 1; lv <= playerLevel; lv++) {
      if (upgradesUnlockedAtLevel(lv).length > 0) return true;
    }
  } catch { /* ignore */ }
  return false;
}
import AnimatedBackground from '@ui/components/AnimatedBackground';
import StarRatingTooltip from '@ui/components/StarRatingTooltip';
import QuestDetailModal from '@ui/modals/QuestDetailModal';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onStart: () => void;            // Free play mode (random orders)
  onStartStage: () => void;       // Stage mode entry — opens StageInfoModal for currentStage
  onStageSelect: () => void;      // Stage browser screen
  onFarmstead: () => void;
  onSettings: () => void;
  onSocial: () => void;
  onBattlePass: () => void;
  onShop: () => void;
  onDeck: () => void;
  onProfile: () => void;
  // Sigilbound combat flow entrypoint (Phase 5).
  onCombat: () => void;
}

function authBadge(auth: AuthStatus): { text: string; color: string } {
  switch (auth.kind) {
    case 'cloud_disabled': return { text: '📴 Local',         color: 'text-white/70' };
    case 'signing_in':     return { text: '☁ …',              color: 'text-white/80' };
    case 'signed_in':      return { text: auth.isAnonymous ? '☁ Anon' : '☁ Synced', color: 'text-emerald-200' };
    case 'error':          return { text: '⚠ Offline',         color: 'text-red-200' };
  }
}

// === Mobile-first FTP layout ===
//
// The home screen lays out as a vertical stack on phones:
//
//   ┌──────────────────────────────────┐
//   │  avatar chip │ currency strip ⚙ │  ← top bar
//   ├──────────────────────────────────┤
//   │                                  │
//   │       🌾  PLOTBOUND               │  ← hero
//   │       FARM · GROW · WIN           │
//   │                                  │
//   │       [ XP bar / level ]          │
//   │                                  │
//   │       [ Daily Quests scroll ]     │
//   │                                  │
//   │       ▶ Continue Farming          │  ← primary CTA
//   │                                  │
//   ├──────────────────────────────────┤
//   │  🃏  🏡  🛒  🎫  👥             │  ← bottom dock
//   └──────────────────────────────────┘
//
// All interactive controls (CTA, dock, currency taps) are reachable from
// the bottom half of the screen — the natural thumb zone for portrait
// mobile. Settings and profile chip live in the top bar (less frequently
// tapped) and the version mark is pushed to the very bottom edge.

export default function HomeScreen({ profile, auth, onStart, onStartStage, onStageSelect, onFarmstead, onSettings, onSocial, onBattlePass, onShop, onDeck, onProfile, onCombat }: Props) {
  const badge = authBadge(auth);
  const quests = allQuests();
  const today = todayKey();
  const todayState = profile.todayQuestsISO === today ? profile.todayQuestsState : {};
  const lp = levelProgress(profile.playerXp);
  const stage = profile.currentStage;
  const stageStars = profile.stageStars[stage] ?? 0;
  const strongholdHasNew = hasNewStrongholdUpgrades(profile);
  const bpClaimable = countBpClaimable(profile);
  // Level reward milestones not yet collected.
  const profileClaimable = (() => {
    const earned = lp.level;
    const claimed = new Set(profile.claimedLevels);
    let n = 0;
    for (let i = 1; i <= earned; i++) if (!claimed.has(i)) n++;
    return n;
  })();

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom flex flex-col">
      <AnimatedBackground variant="menu" />

      {/* === TOP BAR ===
          Profile chip on the left, currency strip on the right, gear button
          all the way to the right. Single horizontal row that anchors at
          the very top of the viewport (inside safe-area). */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-2 py-2 pt-3 pointer-events-none">
        <ProfileChip profile={profile} badge={badge} level={lp.level} claimable={profileClaimable} onClick={onProfile} />
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <CurrencyChip icon="🏦" value={profile.bankCoins} color="#ffd54f" />
          <CurrencyChip icon="💎" value={profile.gems}      color="#80deea" />
          <button
            onClick={() => { sfx.tap(); onSettings(); }}
            className="ml-0.5 w-9 h-9 rounded-full flex items-center justify-center text-base font-extrabold flex-shrink-0"
            style={{
              background: 'linear-gradient(180deg, #fff5d8 0%, #d8c79a 100%)',
              color: '#4a321b',
              border: '2px solid rgba(120,80,30,0.4)',
              boxShadow: '0 3px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
            }}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {/* === HERO + MIDDLE STACK ===
          Centered column. Title at top, then XP bar, daily quests, then
          the big primary CTA pinned just above the bottom dock. Uses
          `flex-1` so it expands to fill the gap between the top bar and
          the dock. */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-between px-4 pb-2 pointer-events-none overflow-hidden">

        {/* Title */}
        <div className="text-center select-none pb-fade-up pt-2 pointer-events-none">
          <div
            className="text-5xl sm:text-7xl pb-bob inline-block"
            style={{ filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.45))', animationDuration: '4s' }}
          >
            ⚔️
          </div>
          <h1 className="pb-title text-4xl sm:text-7xl mt-1">Sigilbound</h1>
          <div className="tracking-[0.4em] text-[10px] sm:text-sm font-bold opacity-90 mt-1.5"
               style={{ textShadow: '0 2px 0 rgba(0,0,0,0.45)' }}>
            BIND · STRIKE · CONQUER
          </div>
        </div>

        {/* Middle: XP bar + daily quests */}
        <div className="w-full max-w-sm flex flex-col gap-2.5 pointer-events-auto">
          <LevelXpBar level={lp.level} pct={lp.pct} into={lp.intoLevelXp} span={lp.nextLevelXp} />
          <DailyQuestsScroll quests={quests} todayState={todayState} />
        </div>

        {/* Primary CTA — opens the StageInfoModal for the player's current
            stage. Underneath it, a thin row exposes the Stages browser and
            a Free Play entry so power users can still play random-order
            seasons without going through the stage curve. */}
        <div className="w-full max-w-sm flex flex-col gap-1.5 pointer-events-auto mt-2">
          <button
            onClick={() => { sfx.nav(); onStartStage(); }}
            className="pb-btn pb-btn-gold pb-btn-lg pb-pulse w-full"
          >
            <span className="flex flex-col items-center leading-tight">
              <span>▶ Stage {stage}</span>
              {stageStars > 0 ? (
                <StarRatingTooltip
                  highlightTier={stageStars as 1 | 2 | 3}
                  placement="bottom"
                >
                  <span className="text-[10px] tracking-[0.3em] opacity-80 mt-0.5">
                    {stageStars}★ BEST
                  </span>
                </StarRatingTooltip>
              ) : (
                <StarRatingTooltip placement="bottom">
                  <span className="text-[10px] tracking-[0.3em] opacity-80 mt-0.5">
                    NEW
                  </span>
                </StarRatingTooltip>
              )}
            </span>
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={onStageSelect}
              className="pb-btn pb-btn-cream pb-btn-sm flex-1"
            >
              📜 Stages
            </button>
            <button
              onClick={onStart}
              className="pb-btn pb-btn-wood pb-btn-sm flex-1"
            >
              🎲 Free Play
            </button>
          </div>
        </div>
      </div>

      {/* === BOTTOM DOCK ===
          5-icon nav bar at the bottom of the viewport — the fingertip
          zone for portrait mobile. Fixed height so the layout above can
          plan around it. */}
      <nav className="relative z-20 flex items-stretch justify-around gap-1 px-2 pb-3 pt-2 pointer-events-auto"
           style={{
             background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(13,58,20,0.85) 30%, rgba(13,58,20,0.95) 100%)',
             borderTop: '2px solid rgba(106,180,123,0.4)',
             boxShadow: '0 -2px 12px rgba(0,0,0,0.35)',
           }}>
        {/* Sigilbound combat flow entry — Phase 5. Shown first so the new
            mode is the natural target. */}
        <DockButton onClick={onCombat} icon="⚔" label="Combat" highlight />
        <DockButton onClick={onDeck} icon="🃏" label="Deck"
          badge={profile.deckPresets[profile.activeDeckPreset]?.entries.reduce((n, e) => n + e.count, 0) ?? 0} />
        <DockButton onClick={onFarmstead} icon="🏰" label="Stronghold"
          badge={strongholdHasNew ? 'NEW' : (profile.bankCoins > 0 ? profile.bankCoins : undefined)} />
        <DockButton onClick={onShop} icon="🛒" label="Shop" highlight
          disabled={auth.kind === 'cloud_disabled'} />
        <DockButton onClick={onBattlePass} icon="🎫" label="Pass"
          badge={bpClaimable > 0 ? bpClaimable : profile.bpPremium ? '👑' : undefined}
          badgePulse={bpClaimable > 0}
          disabled={auth.kind === 'cloud_disabled'} />
        <DockButton onClick={onSocial} icon="👥" label="Social"
          badge={profile.friends.length > 0 ? profile.friends.length : undefined}
          disabled={auth.kind === 'cloud_disabled'} />
      </nav>

      {/* Tiny version mark — bottom-left so it doesn't fight the dock */}
      <div className="absolute bottom-0.5 left-2 z-30 text-[9px] opacity-50 font-mono pointer-events-none">v0.3.0</div>
    </div>
  );
}

// ===================================================
// Top bar: profile chip (avatar + name + level + sync state)
// ===================================================

function ProfileChip({ profile, badge, level, claimable, onClick }: {
  profile: Profile;
  badge: { text: string; color: string };
  level: number;
  claimable: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={() => { sfx.tap(); onClick(); }}
      className="pointer-events-auto flex items-center gap-2 px-2 py-1.5 rounded-full active:scale-95 transition flex-shrink min-w-0"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 100%)',
        border: `2px solid ${claimable > 0 ? 'rgba(233,30,99,0.7)' : 'rgba(255,255,255,0.18)'}`,
        boxShadow: claimable > 0 ? '0 3px 0 rgba(0,0,0,0.25), 0 0 8px rgba(233,30,99,0.4)' : '0 3px 0 rgba(0,0,0,0.25)',
        animation: claimable > 0 ? 'sb-pulse 1.4s ease-in-out infinite' : 'none',
      }}
      aria-label="Open player profile"
    >
      <span
        className="flex items-center justify-center flex-shrink-0 relative"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)',
          border: '2px solid rgba(255,243,176,0.7)',
          fontSize: 18,
          lineHeight: 1,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
        }}
      >
        {profile.avatarEmoji || '🌱'}
        {/* Level badge — small dark pill in the corner */}
        <span
          className="absolute -bottom-1 -right-1 text-[9px] font-extrabold px-1 rounded-full leading-none flex items-center"
          style={{
            background: '#1b3a1f',
            color: '#ffd54f',
            border: '1.5px solid #ffd54f',
            minWidth: 16,
            height: 14,
            justifyContent: 'center',
          }}
        >
          {level}
        </span>
        {/* Notification dot for uncollected level rewards */}
        {claimable > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center"
            style={{
              minWidth: 16, height: 16,
              borderRadius: 999,
              background: '#e91e63',
              border: '1.5px solid #fff',
              color: '#fff',
              fontSize: 9,
              fontWeight: 800,
              fontFamily: 'var(--sb-font-mono)',
              lineHeight: 1,
              padding: '0 3px',
              animation: 'sb-pulse 1.4s ease-in-out infinite',
            }}
          >
            {claimable}
          </span>
        )}
      </span>
      <span className="flex flex-col items-start min-w-0">
        <span className="text-[11px] font-extrabold leading-none truncate max-w-[100px]">
          {profile.displayName ?? 'Anon Sigilist'}
        </span>
        <span className={`text-[9px] leading-none mt-0.5 font-bold ${badge.color} truncate`}>
          {badge.text}
        </span>
      </span>
    </button>
  );
}

// ===================================================
// Top bar: a single currency chip
// ===================================================

function CurrencyChip({ icon, value, color }: { icon: string; value: number; color: string }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-full"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 100%)',
        border: '2px solid rgba(255,255,255,0.18)',
        boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
        minHeight: 32,
      }}
    >
      <span className="text-base leading-none" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>{icon}</span>
      <span className="text-[12px] font-extrabold leading-none" style={{ color, textShadow: '0 1px 0 rgba(0,0,0,0.4)' }}>
        {formatCount(value)}
      </span>
    </div>
  );
}

// Compact a number into k/m form for the top bar so big stacks don't push
// the layout. Examples: 12345 → "12.3k", 1234567 → "1.2m".
function formatCount(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) {
    const k = n / 1000;
    return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  const m = n / 1_000_000;
  return m >= 100 ? `${Math.round(m)}m` : `${m.toFixed(1).replace(/\.0$/, '')}m`;
}

// ===================================================
// Middle: XP bar (level + progress to next)
// ===================================================

function LevelXpBar({ level, pct, into, span }: { level: number; pct: number; into: number; span: number }) {
  const pctRounded = Math.round(pct * 100);
  return (
    <div className="pb-panel-dark px-3 py-2">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-extrabold">
        <span className="opacity-75">Lv {level}</span>
        <span className="opacity-65 normal-case tracking-normal text-[9px]">{into} / {span} XP</span>
      </div>
      <div className="h-2.5 bg-black/45 rounded-full overflow-hidden mt-1.5 relative" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}>
        <div
          className="h-full rounded-full relative"
          style={{
            width: `${pctRounded}%`,
            background: 'linear-gradient(90deg, #80deea 0%, #1976d2 100%)',
            transition: 'width 400ms ease',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
          }}
        >
          {pctRounded > 8 && <div className="absolute inset-0 pb-shimmer" />}
        </div>
      </div>
    </div>
  );
}

// ===================================================
// Middle: Daily quests
// ===================================================

function DailyQuestsScroll({
  quests, todayState,
}: {
  quests: ReturnType<typeof allQuests>;
  todayState: Record<string, { progress: number; claimed: boolean }>;
}) {
  // Selected quest for the detail modal. Tapping the per-row "ⓘ" badge
  // opens it; tapping outside or the Close button dismisses.
  const [detailQuest, setDetailQuest] = useState<Quest | null>(null);

  return (
    <div className="pb-panel px-2.5 py-2">
      <div className="flex items-center justify-center gap-1.5 text-[10px] uppercase tracking-[0.3em] font-bold mb-1.5"
           style={{ color: '#6d4c2a' }}>
        <span>📋</span>
        <span>Daily Quests</span>
        <span>📋</span>
      </div>
      <div className="space-y-1">
        {quests.map(q => {
          const state = todayState[q.id] ?? { progress: 0, claimed: false };
          const pct = Math.min(100, Math.round((state.progress / q.goal) * 100));
          const done = state.claimed || pct >= 100;
          return (
            <div key={q.id} className="flex items-center gap-2 px-1.5 py-1 rounded-lg"
                 style={{ background: done ? 'rgba(165,214,167,0.4)' : 'rgba(255,255,255,0.4)' }}>
              <div className="text-base flex-shrink-0">{q.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-extrabold truncate" style={{ color: '#3e2723' }}>{q.name}</div>
                <div className="h-1.5 bg-black/15 rounded-full overflow-hidden mt-0.5 relative">
                  <div
                    className="h-full rounded-full relative"
                    style={{
                      width: `${pct}%`,
                      background: done
                        ? 'linear-gradient(90deg, #66bb6a 0%, #2e7d32 100%)'
                        : 'linear-gradient(90deg, #ffd54f 0%, #f9a825 100%)',
                      transition: 'width 400ms ease',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                    }}
                  >
                    {!done && pct > 8 && <div className="absolute inset-0 pb-shimmer" />}
                  </div>
                </div>
              </div>
              <div className="text-[10px] font-extrabold whitespace-nowrap" style={{ color: done ? '#1b5e20' : '#1565c0' }}>
                {done ? '✓' : `+${q.rewardGems}💎`}
              </div>
              {/* Per-row "ⓘ" — opens a detailed popover explaining what
                  counts toward this quest. Compact (20×20) so it fits the
                  thin row but still clears the 22 px touch-friendly target
                  thanks to a generous padded hit area. */}
              <button
                type="button"
                onClick={() => { sfx.modalOpen(); setDetailQuest(q); }}
                className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center font-extrabold leading-none active:scale-90 transition"
                style={{
                  background: 'linear-gradient(180deg, #ffffff 0%, #f5e8c8 100%)',
                  color: '#3e2723',
                  border: '1.5px solid #6d4c2a',
                  boxShadow: '0 1.5px 0 rgba(0,0,0,0.2)',
                  fontSize: 10,
                  fontFamily: 'Fredoka One, cursive',
                }}
                aria-label={`Show details for ${q.name}`}
                title="Show quest details"
              >
                i
              </button>
            </div>
          );
        })}
      </div>

      {detailQuest && (
        <QuestDetailModal
          quest={detailQuest}
          state={todayState[detailQuest.id] ?? { progress: 0, claimed: false }}
          onClose={() => setDetailQuest(null)}
        />
      )}
    </div>
  );
}

// ===================================================
// Bottom dock: a single button
// ===================================================

interface DockBtnProps {
  onClick: () => void;
  icon: string;
  label: string;
  badge?: number | string;
  badgePulse?: boolean;
  highlight?: boolean;
  disabled?: boolean;
}

function DockButton({ onClick, icon, label, badge, badgePulse, highlight, disabled }: DockBtnProps) {
  const handleClick = () => { sfx.nav(); onClick(); };
  return (
    <button
      onClick={disabled ? undefined : handleClick}
      disabled={disabled}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-1 active:scale-95 transition relative ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
      style={{
        background: highlight
          ? 'linear-gradient(180deg, rgba(255,213,79,0.22) 0%, rgba(249,168,37,0.1) 100%)'
          : 'rgba(0,0,0,0.18)',
        border: `2px solid ${highlight ? 'rgba(255,213,79,0.55)' : 'rgba(255,255,255,0.1)'}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        minHeight: 56,
      }}
      aria-label={label}
    >
      <div className="text-2xl leading-none" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }}>{icon}</div>
      <div className="text-[10px] font-extrabold leading-none mt-0.5 opacity-95">{label}</div>
      {badge !== undefined && badge !== '' && (
        <span
          className="absolute top-0.5 right-1 text-[9px] font-extrabold px-1 rounded-full leading-none flex items-center justify-center"
          style={{
            background: '#e91e63',
            color: '#fff',
            border: '1.5px solid rgba(255,255,255,0.85)',
            minWidth: 16,
            height: 14,
            boxShadow: badgePulse ? '0 0 6px rgba(233,30,99,0.8)' : '0 1px 2px rgba(0,0,0,0.35)',
            animation: badgePulse ? 'sb-pulse 1.4s ease-in-out infinite' : 'none',
          }}
        >
          {typeof badge === 'number' ? formatCount(badge) : badge}
        </span>
      )}
    </button>
  );
}
