// Sigilbound profile — heraldic statistics dossier.
//
// Layout: dark leather panels with parchment + iron banners, gold accents,
// crimson highlights. Matches the Combat Hub / Shop / Stronghold aesthetic.

import { useState } from 'react';
import {
  MAX_LEVEL,
  allAchievements,
  getCard,
  getPerk,
  levelProgress,
  rewardsForLevel,
  type Achievement,
  type LevelReward,
  type Rarity,
} from '@engine/index';
import {
  claimLevelReward,
  setAvatarEmoji,
  setDisplayName,
  type Profile,
} from '@storage/index';
import type { AuthStatus } from '@firebase-app/auth';
import { signOut } from '@firebase-app/auth';
import RewardClaimModal, { type ClaimableReward } from '@ui/modals/RewardClaimModal';

interface Props {
  profile: Profile;
  auth: AuthStatus;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

type Tab = 'overview' | 'levels' | 'achievements' | 'account';

const AVATAR_OPTIONS = ['⚔️', '🛡️', '🏹', '🗡️', '🪓', '⚒️', '🪄', '📜', '🦌', '🐺', '🦅', '🐉', '🔥', '❄️', '⚡', '✨', '🌑', '👑', '💀', '🦴'];

const RARITY_COLOR: Record<Rarity, string> = {
  common:    '#94a3b8',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#fbbf24',
  mythic:    '#ec4899',
};

const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export default function ProfileScreen({ profile, auth, onProfileChange, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.displayName ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [claimPopup, setClaimPopup] = useState<{ level: number; rewards: ClaimableReward[] } | null>(null);

  const lp = levelProgress(profile.playerXp);

  function showMsg(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 2200);
  }

  function commitName() {
    onProfileChange(setDisplayName(profile, nameDraft));
    setEditingName(false);
  }

  function changeAvatar(emoji: string) {
    onProfileChange(setAvatarEmoji(profile, emoji));
    setPickerOpen(false);
  }

  function claim(level: number) {
    const res = claimLevelReward(profile, level);
    if (!res) {
      showMsg('err', 'Cannot claim — level not yet reached or already claimed.');
      return;
    }
    onProfileChange(res.profile);
    const rewards: ClaimableReward[] = res.rewards.map(r => {
      if (r.type === 'card') return { type: 'card', cardId: r.cardId, count: r.count };
      if (r.type === 'perk') {
        let perkName = r.perkId;
        let perkIcon = '💎';
        try { const p = getPerk(r.perkId); perkName = p.name; perkIcon = p.icon; } catch { /* fall through */ }
        return { type: 'perk', perkId: r.perkId, perkName, perkIcon };
      }
      return r;
    });
    setClaimPopup({ level, rewards });
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full overflow-y-auto safe-top safe-bottom">
      <div className="relative z-10">
        <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 sb-fade-up">

          {/* === Top bar === */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onBack}
              className="sb-chip"
              style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}
            >
              ← HOME
            </button>
            <div
              className="sb-display sb-banner-iron px-4 py-1"
              style={{ fontSize: '11px', letterSpacing: '0.3em' }}
            >
              ✦ SIGILIST PROFILE ✦
            </div>
            <div style={{ width: 50 }} />
          </div>

          {/* === Hero block === */}
          <HeroBlock
            profile={profile}
            lp={lp}
            onEditName={() => { setNameDraft(profile.displayName ?? ''); setEditingName(true); }}
            onChangeAvatar={() => setPickerOpen(o => !o)}
            editingName={editingName}
            nameDraft={nameDraft}
            onNameDraft={setNameDraft}
            onCommitName={commitName}
            onCancelName={() => setEditingName(false)}
          />

          {/* === Avatar picker === */}
          {pickerOpen && (
            <div
              className="sb-leather sb-fade-up px-3 py-3 mb-4"
              style={{ borderRadius: 6 }}
            >
              <div
                className="sb-display text-center mb-2"
                style={{
                  fontSize: '10px',
                  letterSpacing: '0.3em',
                  color: 'var(--sb-gold-light)',
                  opacity: 0.8,
                }}
              >
                CHOOSE YOUR SIGIL
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {AVATAR_OPTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => changeAvatar(e)}
                    className="text-2xl transition active:scale-95"
                    style={{
                      background: profile.avatarEmoji === e
                        ? 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)'
                        : 'rgba(15,10,7,0.55)',
                      border: `1.5px solid ${profile.avatarEmoji === e ? 'var(--sb-gold-light)' : 'var(--sb-bronze-dark)'}`,
                      borderRadius: 4,
                      padding: '6px 4px',
                      boxShadow: profile.avatarEmoji === e
                        ? 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 10px rgba(251,191,36,0.4)'
                        : 'inset 0 1px 0 rgba(255,235,180,0.08)',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* === Toast === */}
          {msg && (
            <div
              className="sb-display sb-fade-up text-center px-3 py-2 mb-3"
              style={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                background: msg.kind === 'ok' ? 'rgba(74,222,128,0.20)' : 'rgba(220,38,38,0.20)',
                border: `1.5px solid ${msg.kind === 'ok' ? '#4ade80' : 'var(--sb-crimson-light)'}`,
                borderRadius: '3px',
                color: msg.kind === 'ok' ? '#86efac' : '#fecaca',
              }}
            >
              {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text.toUpperCase()}
            </div>
          )}

          {/* === Tabs === */}
          <div className="grid grid-cols-2 sm:flex gap-1.5 sm:gap-2 mb-3">
            <TabButton active={tab === 'overview'}      onClick={() => setTab('overview')}>📊 STATS</TabButton>
            <TabButton active={tab === 'levels'}        onClick={() => setTab('levels')}>🎁 REWARDS</TabButton>
            <TabButton active={tab === 'achievements'}  onClick={() => setTab('achievements')}>🏆 ACHIEVEMENTS</TabButton>
            <TabButton active={tab === 'account'}       onClick={() => setTab('account')}>☁ ACCOUNT</TabButton>
          </div>

          {tab === 'overview'     && <OverviewTab profile={profile} />}
          {tab === 'levels'       && <LevelsTab profile={profile} onClaim={claim} />}
          {tab === 'achievements' && <AchievementsTab profile={profile} />}
          {tab === 'account'      && <AccountTab profile={profile} auth={auth} onProfileChange={onProfileChange} />}
        </div>
      </div>

      {claimPopup && (
        <RewardClaimModal
          source="level"
          subtitle={`Level ${claimPopup.level}`}
          rewards={claimPopup.rewards}
          onClose={() => setClaimPopup(null)}
        />
      )}
    </div>
  );
}

// ─── Hero block ──────────────────────────────────────────────────────────────

function HeroBlock(props: {
  profile: Profile;
  lp: ReturnType<typeof levelProgress>;
  onEditName: () => void;
  onChangeAvatar: () => void;
  editingName: boolean;
  nameDraft: string;
  onNameDraft: (s: string) => void;
  onCommitName: () => void;
  onCancelName: () => void;
}) {
  const { profile, lp, onEditName, onChangeAvatar, editingName, nameDraft, onNameDraft, onCommitName, onCancelName } = props;
  const isMax = lp.level >= MAX_LEVEL;
  const claimable = countClaimableLevels(profile);

  return (
    <div
      className="sb-fade-up px-4 py-4 mb-4 relative"
      style={{
        background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: '2px solid var(--sb-bronze)',
        borderRadius: 6,
        color: 'var(--sb-gold-light)',
        boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.18), var(--sb-shadow-md)',
      }}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Avatar shield */}
        <button
          onClick={onChangeAvatar}
          className="flex-shrink-0 flex items-center justify-center transition active:scale-95"
          style={{
            width: 88,
            height: 88,
            background: 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)',
            border: '3px solid var(--sb-gold-light)',
            borderRadius: 8,
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), 0 4px 14px rgba(0,0,0,0.45), var(--sb-glow-gold)',
            fontSize: 52,
            lineHeight: 1,
            color: '#1a0f0a',
          }}
          aria-label="Change avatar"
        >
          {profile.avatarEmoji || '⚔️'}
        </button>

        {/* Name + level meta */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex gap-1.5">
              <input
                value={nameDraft}
                onChange={e => onNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') onCommitName(); if (e.key === 'Escape') onCancelName(); }}
                placeholder="Your hero name"
                maxLength={20}
                autoFocus
                className="flex-1 px-2 py-1.5 sb-display focus:outline-none"
                style={{
                  fontSize: '14px',
                  letterSpacing: '0.04em',
                  background: 'rgba(15,10,7,0.7)',
                  border: '1.5px solid var(--sb-gold)',
                  borderRadius: 3,
                  color: 'var(--sb-gold-light)',
                }}
              />
              <button onClick={onCommitName} className="sb-btn sb-btn-gold" style={{ fontSize: '11px', padding: '6px 12px' }}>✓</button>
              <button onClick={onCancelName} className="sb-btn sb-btn-steel" style={{ fontSize: '11px', padding: '6px 12px' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={onEditName}
              className="text-left sb-display truncate w-full"
              style={{
                fontSize: 'clamp(20px, 5vw, 28px)',
                color: 'var(--sb-gold-light)',
                letterSpacing: '0.04em',
                textShadow: '0 2px 0 rgba(0,0,0,0.5), 0 0 14px rgba(251,191,36,0.18)',
              }}
            >
              {profile.displayName ?? 'Anon Sigilist'}
              <span className="ml-2 text-xs opacity-50">✏</span>
            </button>
          )}
          {profile.farmCode && (
            <div
              className="sb-mono text-[10px] mt-0.5 opacity-65 truncate"
              style={{ letterSpacing: '0.1em', color: 'var(--sb-gold-light)' }}
            >
              {profile.farmCode}
            </div>
          )}

          {/* Level + XP bar */}
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-2">
                <span
                  className="sb-mono text-[10px] uppercase font-bold"
                  style={{ letterSpacing: '0.18em', color: 'var(--sb-gold)', opacity: 0.7 }}
                >
                  LEVEL
                </span>
                <span className="sb-display" style={{ fontSize: '24px', color: 'var(--sb-gold-light)' }}>
                  {lp.level}
                </span>
                <span className="sb-mono text-[10px] opacity-55">/ {MAX_LEVEL}</span>
              </div>
              <div className="sb-mono text-[10px] opacity-75 font-bold" style={{ letterSpacing: '0.05em' }}>
                {isMax ? 'MAX' : `${lp.intoLevelXp} / ${lp.nextLevelXp} XP`}
              </div>
            </div>
            <div
              className="relative overflow-hidden"
              style={{
                height: 14,
                background: 'rgba(0,0,0,0.6)',
                border: '1.5px solid var(--sb-bronze-dark)',
                borderRadius: 2,
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
              }}
            >
              <div
                className="h-full"
                style={{
                  width: `${Math.round(lp.pct * 100)}%`,
                  background: 'linear-gradient(180deg, var(--sb-gold-light) 0%, var(--sb-gold) 50%, var(--sb-bronze) 100%)',
                  transition: 'width 400ms ease',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45)',
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {claimable > 0 && (
        <div
          className="sb-display sb-pulse-crimson mt-3 px-3 py-2 text-center"
          style={{
            background: 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)',
            color: '#1a0f0a',
            border: '1.5px solid var(--sb-gold-light)',
            borderRadius: 3,
            fontSize: '11px',
            letterSpacing: '0.18em',
            textShadow: '0 1px 0 rgba(255,255,255,0.3)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 0 14px rgba(251,191,36,0.5)',
          }}
        >
          🎁 {claimable} REWARD{claimable === 1 ? '' : 'S'} READY · OPEN REWARDS TAB
        </div>
      )}
    </div>
  );
}

function countClaimableLevels(profile: Profile): number {
  const earned = levelProgress(profile.playerXp).level;
  const claimedSet = new Set(profile.claimedLevels);
  let n = 0;
  for (let i = 1; i <= earned; i++) if (!claimedSet.has(i)) n++;
  return n;
}

// ─── Stats tab ───────────────────────────────────────────────────────────────

function OverviewTab({ profile }: { profile: Profile }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sb-fade-up">
      <StatCard label="Battles Played"  value={profile.seasonsPlayed}              icon="⚔️" />
      <StatCard label="Best Score"      value={profile.bestScore}                  icon="🏆" color="var(--sb-gold)" />
      <StatCard label="Lifetime Gold"   value={profile.totalCoinsEarned}           icon="💰" color="var(--sb-gold-light)" />
      <StatCard label="Bank Gold"       value={profile.bankCoins}                  icon="🏦" color="var(--sb-gold-light)" />
      <StatCard label="Crystals"        value={profile.gems}                       icon="💎" color="#93c5fd" />
      <StatCard label="Soul Shards"     value={profile.perkShards}                 icon="✨" color="var(--sb-arcane)" />
      <StatCard label="Upgrades"        value={profile.upgradesOwned.length}       icon="🏰" />
      <StatCard label="Talents Owned"   value={profile.perksOwned.length}          icon="💎" color="var(--sb-arcane)" />
      <StatCard label="Sigil Rating"    value={profile.hr}                         icon="⚔" color="var(--sb-crimson-light)" />
      <StatCard label="Onslaught"       value={profile.lifetimeCombos.onslaught}   icon="🔥" color="var(--sb-pyre)" />
      <StatCard label="Triadic"         value={profile.lifetimeCombos.triadic}     icon="🌈" color="var(--sb-frost)" />
      <StatCard label="Relentless"      value={profile.lifetimeCombos.relentless}  icon="🔁" color="#ec4899" />
    </div>
  );
}

function StatCard({ label, value, icon, color = 'var(--sb-gold-light)' }: {
  label: string; value: number | string; icon: string; color?: string;
}) {
  return (
    <div
      className="px-3 py-2.5"
      style={{
        background: 'linear-gradient(180deg, rgba(20,14,8,0.85) 0%, rgba(10,7,5,0.95) 100%)',
        border: '1px solid var(--sb-bronze-dark)',
        borderRadius: 4,
        color: 'var(--sb-gold-light)',
        boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.08)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-base">{icon}</span>
        <span
          className="sb-mono uppercase truncate"
          style={{
            fontSize: '9px',
            letterSpacing: '0.18em',
            color: 'var(--sb-gold)',
            opacity: 0.65,
            fontWeight: 700,
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="sb-display mt-1"
        style={{ fontSize: '17px', color, letterSpacing: '0.03em' }}
      >
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ─── Levels tab ──────────────────────────────────────────────────────────────

function LevelsTab({ profile, onClaim }: { profile: Profile; onClaim: (level: number) => void }) {
  const lp = levelProgress(profile.playerXp);
  const claimedSet = new Set(profile.claimedLevels);
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

  return (
    <div className="space-y-1.5 sb-fade-up">
      {levels.map(level => {
        const reached = level <= lp.level;
        const claimed = claimedSet.has(level);
        const milestone = level % 5 === 0;
        const rewards = rewardsForLevel(level);
        return (
          <LevelRow
            key={level}
            level={level}
            milestone={milestone}
            reached={reached}
            claimed={claimed}
            current={level === lp.level}
            rewards={rewards}
            onClaim={() => onClaim(level)}
          />
        );
      })}
    </div>
  );
}

function LevelRow(props: {
  level: number;
  milestone: boolean;
  reached: boolean;
  claimed: boolean;
  current: boolean;
  rewards: LevelReward[];
  onClaim: () => void;
}) {
  const { level, milestone, reached, claimed, current, rewards, onClaim } = props;
  const claimable = reached && !claimed;

  let bg: string;
  let border: string;
  if (current) {
    border = 'var(--sb-gold)';
    bg = 'linear-gradient(180deg, rgba(251,191,36,0.18) 0%, rgba(120,53,15,0.12) 100%)';
  } else if (milestone && reached) {
    border = 'var(--sb-bronze)';
    bg = 'linear-gradient(180deg, rgba(180,83,9,0.18) 0%, rgba(40,28,14,0.55) 100%)';
  } else if (reached) {
    border = 'var(--sb-bronze-dark)';
    bg = 'linear-gradient(180deg, rgba(20,14,8,0.85) 0%, rgba(10,7,5,0.95) 100%)';
  } else {
    border = 'rgba(120,53,15,0.35)';
    bg = 'linear-gradient(180deg, rgba(10,7,5,0.85) 0%, rgba(5,4,3,0.92) 100%)';
  }

  return (
    <div
      className="flex items-center gap-2 p-2.5"
      style={{
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 4,
        opacity: reached ? 1 : 0.6,
        boxShadow: current ? '0 0 12px rgba(251,191,36,0.35)' : 'inset 0 1px 0 rgba(255,235,180,0.06)',
      }}
    >
      <div
        className="sb-display flex flex-col items-center justify-center flex-shrink-0"
        style={{
          width: 44,
          height: 44,
          background: reached
            ? milestone
              ? 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)'
              : 'linear-gradient(180deg, #475569 0%, #1e293b 100%)'
            : 'linear-gradient(180deg, #18120e 0%, #0a0604 100%)',
          color: reached ? (milestone ? '#1a0f0a' : 'var(--sb-gold-light)') : 'rgba(255,235,180,0.35)',
          border: `1.5px solid ${reached ? 'var(--sb-bronze)' : 'rgba(120,53,15,0.4)'}`,
          borderRadius: 4,
          textShadow: reached && milestone ? '0 1px 0 rgba(255,255,255,0.3)' : '0 1px 2px rgba(0,0,0,0.7)',
          boxShadow: reached ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.4)' : 'inset 0 1px 0 rgba(255,235,180,0.04)',
        }}
      >
        <div className="text-base leading-none">{level}</div>
        {milestone && <div className="text-[8px] leading-none opacity-90 mt-0.5">★</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="sb-display text-sm flex items-center gap-1.5" style={{ color: 'var(--sb-gold-light)' }}>
          LEVEL {level}
          {milestone && (
            <span
              className="sb-mono text-[8px] uppercase font-extrabold px-1.5 py-0.5"
              style={{
                background: 'var(--sb-gold)',
                color: '#1a0f0a',
                letterSpacing: '0.18em',
                borderRadius: 2,
              }}
            >
              MILESTONE
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {rewards.map((r, i) => <RewardChip key={i} reward={r} muted={!reached} />)}
        </div>
      </div>
      {claimed ? (
        <span
          className="sb-display flex-shrink-0 px-2.5 py-1.5"
          style={{
            background: 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)',
            color: '#0a2a14',
            border: '1.5px solid #86efac',
            borderRadius: 3,
            fontSize: '10px',
            letterSpacing: '0.1em',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
          }}
        >
          ✓
        </span>
      ) : claimable ? (
        <button onClick={onClaim} className="sb-btn sb-btn-gold flex-shrink-0" style={{ fontSize: '11px', padding: '7px 12px' }}>
          CLAIM
        </button>
      ) : (
        <span className="text-base opacity-40 flex-shrink-0">⏳</span>
      )}
    </div>
  );
}

function RewardChip({ reward, muted }: { reward: LevelReward; muted?: boolean }) {
  const baseStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.55)',
    border: '1px solid rgba(255,235,180,0.18)',
    color: 'var(--sb-gold-light)',
    opacity: muted ? 0.55 : 1,
    fontFamily: 'var(--sb-font-mono)',
    fontSize: '10px',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 3,
    letterSpacing: '0.04em',
  };
  switch (reward.type) {
    case 'coins':
      return <span style={baseStyle}>💰 {reward.value.toLocaleString()}</span>;
    case 'gems':
      return <span style={baseStyle}>💎 {reward.value}</span>;
    case 'shards':
      return <span style={baseStyle}>✨ {reward.value}</span>;
    case 'card': {
      const card = (() => { try { return getCard(reward.cardId); } catch { return null; } })();
      const emoji = card?.emoji ?? '🃏';
      return <span style={baseStyle}>{emoji} ×{reward.count}</span>;
    }
    case 'perk': {
      const perk = (() => { try { return getPerk(reward.perkId); } catch { return null; } })();
      const icon = perk?.icon ?? '💎';
      return <span style={baseStyle}>{icon} ×{reward.count}</span>;
    }
  }
}

// ─── Achievements tab ────────────────────────────────────────────────────────

function AchievementsTab({ profile }: { profile: Profile }) {
  const all = allAchievements();
  const unlockedSet = new Set(profile.achievementsUnlocked);
  const unlocked = all.filter(a => unlockedSet.has(a.id));
  const locked = all.filter(a => !unlockedSet.has(a.id));

  const sortFn = (a: Achievement, b: Achievement) => {
    const ra = RARITY_ORDER.indexOf(a.rarity);
    const rb = RARITY_ORDER.indexOf(b.rarity);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  };
  unlocked.sort(sortFn);
  locked.sort(sortFn);

  const pct = Math.round((unlocked.length / Math.max(1, all.length)) * 100);

  return (
    <div className="sb-fade-up">
      {/* Summary banner */}
      <div
        className="sb-banner-iron flex items-center justify-between px-4 py-3 mb-3"
        style={{ borderRadius: 4 }}
      >
        <div className="sb-display" style={{ fontSize: '14px', letterSpacing: '0.05em' }}>
          <span style={{ color: 'var(--sb-gold)' }}>{unlocked.length}</span>
          <span style={{ opacity: 0.6 }}> / {all.length} UNLOCKED</span>
        </div>
        <div
          className="sb-mono text-[10px] uppercase font-bold"
          style={{ letterSpacing: '0.18em', color: 'var(--sb-gold-light)', opacity: 0.75 }}
        >
          {pct}% COMPLETE
        </div>
      </div>

      {unlocked.length > 0 && (
        <>
          <SectionHeader icon="⭐" label="UNLOCKED" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {unlocked.map(a => <AchievementCard key={a.id} a={a} unlocked />)}
          </div>
        </>
      )}

      <SectionHeader icon="🔒" label="LOCKED" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {locked.map(a => <AchievementCard key={a.id} a={a} unlocked={false} />)}
      </div>
    </div>
  );
}

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div
      className="sb-display flex items-center gap-2 mb-1.5 px-1"
      style={{ fontSize: '11px', letterSpacing: '0.25em', color: 'var(--sb-gold-light)', opacity: 0.85 }}
    >
      <span>{icon}</span>
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,235,180,0.15)', marginLeft: 6 }} />
    </div>
  );
}

function AchievementCard({ a, unlocked }: { a: Achievement; unlocked: boolean }) {
  const accent = RARITY_COLOR[a.rarity];
  return (
    <div
      className="p-2.5 flex gap-2 relative"
      style={{
        background: unlocked
          ? 'linear-gradient(180deg, rgba(20,14,8,0.85) 0%, rgba(10,7,5,0.92) 100%)'
          : 'linear-gradient(180deg, rgba(10,7,5,0.85) 0%, rgba(5,4,3,0.92) 100%)',
        border: `1.5px solid ${unlocked ? accent : 'rgba(120,53,15,0.4)'}`,
        borderRadius: 4,
        color: 'var(--sb-gold-light)',
        opacity: unlocked ? 1 : 0.65,
        boxShadow: unlocked ? `0 0 8px ${accent}40, inset 0 1px 0 rgba(255,235,180,0.08)` : 'inset 0 1px 0 rgba(255,235,180,0.04)',
      }}
    >
      <div
        className="text-2xl flex-shrink-0"
        style={{ filter: unlocked ? 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))' : 'grayscale(80%) brightness(0.6)' }}
      >
        {a.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <div
            className="sb-display text-[12px] leading-tight truncate"
            style={{ color: unlocked ? 'var(--sb-gold-light)' : 'rgba(255,235,180,0.55)' }}
          >
            {a.name}
          </div>
          <div
            className="sb-mono text-[8px] uppercase font-extrabold px-1 py-0.5"
            style={{
              background: accent,
              color: '#0f172a',
              letterSpacing: '0.15em',
              borderRadius: 2,
            }}
          >
            {a.rarity}
          </div>
        </div>
        <div
          className="text-[10px] leading-snug mt-1"
          style={{ color: 'rgba(255,235,180,0.7)' }}
        >
          {a.description}
        </div>
      </div>
    </div>
  );
}

// ─── Account tab ─────────────────────────────────────────────────────────────

function AccountTab({ profile, auth, onProfileChange }: {
  profile: Profile; auth: AuthStatus; onProfileChange: (p: Profile) => void;
}) {
  void onProfileChange;
  const [signedOut, setSignedOut] = useState(false);

  return (
    <div className="space-y-3 sb-fade-up">
      {/* Cloud panel */}
      <div
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(20,14,8,0.85) 0%, rgba(10,7,5,0.95) 100%)',
          border: '1.5px solid var(--sb-bronze-dark)',
          borderRadius: 4,
          color: 'var(--sb-gold-light)',
          boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.08)',
        }}
      >
        <SectionHeader icon="☁" label="CLOUD SYNC" />
        {auth.kind === 'cloud_disabled' && (
          <div className="text-sm mt-1">
            <div className="sb-display" style={{ color: 'var(--sb-gold-light)' }}>📴 LOCAL-ONLY</div>
            <div className="text-[11px] opacity-75 mt-1">No Firebase configured. Progress is saved locally only.</div>
          </div>
        )}
        {auth.kind === 'signing_in' && (
          <div className="text-sm opacity-75 sb-mono mt-1" style={{ letterSpacing: '0.05em' }}>☁ SIGNING IN…</div>
        )}
        {auth.kind === 'error' && (
          <div className="text-sm mt-1">
            <div className="sb-display" style={{ color: 'var(--sb-crimson-light)' }}>⚠ SIGN-IN ERROR</div>
            <div className="text-[11px] opacity-75 mt-1">{auth.message}</div>
          </div>
        )}
        {auth.kind === 'signed_in' && (
          <div className="text-sm mt-1">
            <div className="sb-display" style={{ color: '#86efac' }}>
              {auth.isAnonymous ? '👤 ANONYMOUS ACCOUNT' : '✅ SIGNED IN'}
            </div>
            <div className="sb-mono text-[10px] opacity-65 mt-1 break-all" style={{ letterSpacing: '0.04em' }}>
              {auth.uid}
            </div>
            {profile.farmCode && (
              <div className="text-[11px] opacity-85 mt-1">
                Sigil code: <span className="sb-mono font-extrabold" style={{ color: 'var(--sb-gold)' }}>{profile.farmCode}</span>
              </div>
            )}
            <button
              onClick={async () => { await signOut(); setSignedOut(true); }}
              className="sb-btn sb-btn-steel mt-3"
              style={{ fontSize: '11px', padding: '7px 14px' }}
            >
              SIGN OUT
            </button>
            {signedOut && (
              <div className="text-[11px] opacity-70 mt-2">Reload the page to sign back in.</div>
            )}
          </div>
        )}
      </div>

      {/* PvP record */}
      <div
        className="px-4 py-3"
        style={{
          background: 'linear-gradient(180deg, rgba(20,14,8,0.85) 0%, rgba(10,7,5,0.95) 100%)',
          border: '1.5px solid var(--sb-bronze-dark)',
          borderRadius: 4,
          color: 'var(--sb-gold-light)',
          boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.08)',
        }}
      >
        <SectionHeader icon="⚔" label="PVP RECORD" />
        <div className="grid grid-cols-3 gap-2 text-center mt-2">
          <PvpStat label="WINS"   value={profile.pvpWins}   color="#86efac" tint="rgba(74,222,128,0.18)"  border="rgba(74,222,128,0.45)" />
          <PvpStat label="LOSSES" value={profile.pvpLosses} color="#fecaca" tint="rgba(220,38,38,0.18)"   border="rgba(220,38,38,0.45)" />
          <PvpStat label="DRAWS"  value={profile.pvpDraws}  color="#cbd5e1" tint="rgba(100,116,139,0.18)" border="rgba(100,116,139,0.45)" />
        </div>
        <div
          className="sb-mono text-[11px] mt-3 text-center"
          style={{ letterSpacing: '0.1em', color: 'var(--sb-gold-light)', opacity: 0.85 }}
        >
          SIGIL RATING:&nbsp;
          <span className="sb-display font-extrabold" style={{ color: 'var(--sb-crimson-light)' }}>
            ⚔ {profile.hr}
          </span>
        </div>
      </div>
    </div>
  );
}

function PvpStat({ label, value, color, tint, border }: {
  label: string; value: number; color: string; tint: string; border: string;
}) {
  return (
    <div
      className="py-2"
      style={{
        background: tint,
        border: `1px solid ${border}`,
        borderRadius: 3,
      }}
    >
      <div
        className="sb-mono text-[9px] uppercase font-bold"
        style={{ letterSpacing: '0.18em', opacity: 0.75, color: 'var(--sb-gold-light)' }}
      >
        {label}
      </div>
      <div className="sb-display mt-1" style={{ fontSize: '17px', color }}>
        {value}
      </div>
    </div>
  );
}

// ─── Tab button ──────────────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`sb-btn flex-1 ${active ? 'sb-btn-gold' : 'sb-btn-steel'}`}
      style={{ fontSize: '11px', padding: '8px 10px', letterSpacing: '0.1em' }}
    >
      {children}
    </button>
  );
}
