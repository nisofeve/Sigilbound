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

const AVATAR_OPTIONS = ['🌱', '🌾', '🥕', '🌽', '🍅', '🍓', '🍄', '🌻', '🐔', '🐮', '🐷', '🦊', '🐸', '🦉', '👨‍🌾', '👩‍🌾'];

const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7',
  uncommon: '#90caf9',
  rare: '#ce93d8',
  epic: '#ffab76',
  legendary: '#ffd54f',
  mythic: '#ff80ab',
};

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

export default function ProfileScreen({ profile, auth, onProfileChange, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.displayName ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // Reward popup — set when a level claim succeeds, cleared by the modal's
  // Collect button. Carries the source level for the subtitle.
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
    // Show the celebratory popup. Translate the engine reward shape into the
    // modal's ClaimableReward shape — currencies map 1:1, perks need their
    // human-readable name + icon resolved from the data file.
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
        <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 sm:py-6 sb-fade-up">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
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

          {/* Hero: avatar + name + level bar */}
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

          {/* Avatar picker drawer */}
          {pickerOpen && (
            <div className="pb-panel px-3 py-3 mb-4 pb-pop-in" style={{ color: '#3e2723' }}>
              <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2 text-center" style={{ color: '#6d4c2a' }}>
                Pick an avatar
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {AVATAR_OPTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => changeAvatar(e)}
                    className="text-2xl rounded-lg transition active:scale-95"
                    style={{
                      background: profile.avatarEmoji === e ? '#ffd54f' : 'rgba(255,255,255,0.5)',
                      border: `2px solid ${profile.avatarEmoji === e ? '#c17900' : 'rgba(120,80,30,0.3)'}`,
                      padding: '6px 4px',
                      boxShadow: profile.avatarEmoji === e ? 'inset 0 1px 0 rgba(255,255,255,0.5)' : 'none',
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {msg && (
            <div
              className="rounded-xl p-2.5 text-sm mb-3 font-bold pb-pop-in"
              style={{
                background: msg.kind === 'ok' ? 'rgba(46,125,50,0.25)' : 'rgba(198,40,40,0.18)',
                border: `2px solid ${msg.kind === 'ok' ? '#2e7d32' : '#c62828'}`,
                color: '#fff',
              }}
            >
              {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text}
            </div>
          )}

          {/* Tabs */}
          <div className="grid grid-cols-2 sm:flex gap-1.5 sm:gap-2 mb-3">
            <TabButton active={tab === 'overview'}      onClick={() => setTab('overview')}>📊 Stats</TabButton>
            <TabButton active={tab === 'levels'}        onClick={() => setTab('levels')}>🎁 Rewards</TabButton>
            <TabButton active={tab === 'achievements'}  onClick={() => setTab('achievements')}>🏆 Achievements</TabButton>
            <TabButton active={tab === 'account'}       onClick={() => setTab('account')}>☁ Account</TabButton>
          </div>

          {tab === 'overview' && <OverviewTab profile={profile} />}
          {tab === 'levels' && <LevelsTab profile={profile} onClaim={claim} />}
          {tab === 'achievements' && <AchievementsTab profile={profile} />}
          {tab === 'account' && <AccountTab profile={profile} auth={auth} onProfileChange={onProfileChange} />}
        </div>
      </div>

      {/* Reward popup — anchored to the screen, fires on level claim. */}
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

// ===================================================
// Hero block
// ===================================================

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
    <div className="pb-panel-dark px-4 py-4 mb-4 pb-pop-in">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Avatar */}
        <button
          onClick={onChangeAvatar}
          className="flex-shrink-0 rounded-2xl flex items-center justify-center transition active:scale-95"
          style={{
            width: 84,
            height: 84,
            background: 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)',
            border: '3px solid rgba(255,243,176,0.7)',
            boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.4), 0 4px 0 rgba(0,0,0,0.25), 0 6px 14px rgba(0,0,0,0.3)',
            fontSize: 56,
            lineHeight: 1,
          }}
          aria-label="Change avatar"
        >
          {profile.avatarEmoji || '🌱'}
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
                className="flex-1 rounded-lg px-2 py-1.5 text-sm font-extrabold focus:outline-none"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '2px solid rgba(120,80,30,0.4)',
                  color: '#3e2723',
                }}
              />
              <button onClick={onCommitName} className="pb-btn pb-btn-gold pb-btn-sm !px-2">✓</button>
              <button onClick={onCancelName} className="pb-btn pb-btn-cream pb-btn-sm !px-2">✕</button>
            </div>
          ) : (
            <button
              onClick={onEditName}
              className="text-left fredoka text-2xl sm:text-3xl truncate w-full"
              style={{ color: '#ffd54f', textShadow: '0 2px 0 rgba(0,0,0,0.4)' }}
            >
              {profile.displayName ?? 'Anon Sigilist'}
              <span className="ml-2 text-xs opacity-50">✏</span>
            </button>
          )}
          {profile.farmCode && (
            <div className="text-[10px] font-mono opacity-75 truncate mt-0.5" style={{ letterSpacing: '0.1em' }}>
              {profile.farmCode}
            </div>
          )}

          {/* Level + XP bar */}
          <div className="mt-2.5">
            <div className="flex items-baseline justify-between mb-1">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-widest opacity-75 font-bold">Level</span>
                <span className="fredoka text-2xl" style={{ color: '#ffe082' }}>{lp.level}</span>
                <span className="text-[10px] opacity-60">/ {MAX_LEVEL}</span>
              </div>
              <div className="text-[10px] opacity-75 font-bold">
                {isMax ? 'MAX' : `${lp.intoLevelXp} / ${lp.nextLevelXp} XP`}
              </div>
            </div>
            <div className="h-3 bg-black/45 rounded-full overflow-hidden relative" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}>
              <div
                className="h-full rounded-full relative"
                style={{
                  width: `${Math.round(lp.pct * 100)}%`,
                  background: 'linear-gradient(90deg, #80deea 0%, #1976d2 100%)',
                  transition: 'width 400ms ease',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                }}
              >
                {lp.pct > 0.08 && <div className="absolute inset-0 pb-shimmer" />}
              </div>
            </div>
          </div>
        </div>
      </div>

      {claimable > 0 && (
        <div
          className="mt-3 px-3 py-2 rounded-lg text-center text-xs font-extrabold pb-pulse"
          style={{
            background: 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)',
            color: '#4a2e00',
            border: '2px solid rgba(255,243,176,0.7)',
            boxShadow: '0 3px 0 rgba(0,0,0,0.18)',
          }}
        >
          🎁 {claimable} reward{claimable === 1 ? '' : 's'} ready to claim — open the Rewards tab!
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

// ===================================================
// Tab: Stats
// ===================================================

function OverviewTab({ profile }: { profile: Profile }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pb-fade-up">
      <StatCard label="Battles Played" value={profile.seasonsPlayed} icon="⚔️" />
      <StatCard label="Best Score"     value={profile.bestScore}     icon="🏆" color="#ffd54f" />
      <StatCard label="Lifetime Gold"  value={profile.totalCoinsEarned} icon="💰" color="#fff176" />
      <StatCard label="Bank"           value={profile.bankCoins}     icon="🏦" color="#ffe082" />
      <StatCard label="Crystals"       value={profile.gems}          icon="💎" color="#80deea" />
      <StatCard label="Soul Shards"    value={profile.perkShards}    icon="✨" color="#ffd54f" />
      <StatCard label="Upgrades"       value={profile.upgradesOwned.length} icon="🏗" />
      <StatCard label="Talents Owned"  value={profile.perksOwned.length}    icon="💎" color="#ce93d8" />
      <StatCard label="HR (PvP)"       value={profile.hr}            icon="⚔" color="#f48fb1" />
      <StatCard label="Onslaught"      value={profile.lifetimeCombos.onslaught} icon="⚔️" color="#fff176" />
      <StatCard label="Triadic"        value={profile.lifetimeCombos.triadic} icon="🌈" color="#80deea" />
      <StatCard label="Relentless"     value={profile.lifetimeCombos.relentless} icon="🔁" color="#f8bbd0" />
    </div>
  );
}

function StatCard({ label, value, icon, color = '#ffffff' }: { label: string; value: number | string; icon: string; color?: string }) {
  return (
    <div className="pb-panel-dark px-3 py-2.5">
      <div className="flex items-center gap-1.5">
        <span className="text-base">{icon}</span>
        <span className="text-[9px] uppercase tracking-widest opacity-70 font-extrabold truncate">{label}</span>
      </div>
      <div className="font-extrabold text-base mt-0.5" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

// ===================================================
// Tab: Levels & Rewards
// ===================================================

function LevelsTab({ profile, onClaim }: { profile: Profile; onClaim: (level: number) => void }) {
  const lp = levelProgress(profile.playerXp);
  const claimedSet = new Set(profile.claimedLevels);
  const levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

  return (
    <div className="space-y-2 pb-fade-up">
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
  return (
    <div
      className="flex items-center gap-2 p-2.5 rounded-xl"
      style={{
        background: milestone ? 'linear-gradient(180deg, rgba(255,213,79,0.22) 0%, rgba(249,168,37,0.12) 100%)' : reached ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.32)',
        border: `2px solid ${current ? '#ffd54f' : milestone ? 'rgba(255,213,79,0.55)' : reached ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: current ? '0 0 0 2px rgba(255,213,79,0.35)' : 'none',
        opacity: reached ? 1 : 0.65,
      }}
    >
      <div
        className="w-11 h-11 rounded-full flex flex-col items-center justify-center font-extrabold flex-shrink-0"
        style={{
          background: reached
            ? milestone
              ? 'linear-gradient(180deg, #ffd54f 0%, #c17900 100%)'
              : 'linear-gradient(180deg, #80deea 0%, #1976d2 100%)'
            : 'linear-gradient(180deg, #424242 0%, #212121 100%)',
          color: reached ? (milestone ? '#4a2e00' : '#fff') : '#9e9e9e',
          border: `2px solid ${reached ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.15)'}`,
          textShadow: reached ? '0 1px 0 rgba(0,0,0,0.25)' : 'none',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 0 rgba(0,0,0,0.18)',
        }}
      >
        <div className="text-base leading-none">{level}</div>
        {milestone && <div className="text-[8px] leading-none opacity-90 mt-0.5">★</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold flex items-center gap-1.5">
          Level {level}
          {milestone && <span className="text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full" style={{ background: '#ffd54f', color: '#4a2e00' }}>MILESTONE</span>}
        </div>
        <div className="flex flex-wrap gap-1 mt-1">
          {rewards.map((r, i) => <RewardChip key={i} reward={r} muted={!reached} />)}
        </div>
      </div>
      {claimed ? (
        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-lg flex-shrink-0"
              style={{ background: 'rgba(46,125,50,0.55)', color: '#fff' }}>
          ✓
        </span>
      ) : claimable ? (
        <button onClick={onClaim} className="pb-btn pb-btn-gold pb-btn-sm flex-shrink-0">Claim</button>
      ) : (
        <span className="text-base opacity-40 flex-shrink-0">⏳</span>
      )}
    </div>
  );
}

function RewardChip({ reward, muted }: { reward: LevelReward; muted?: boolean }) {
  const baseStyle = {
    background: 'rgba(0,0,0,0.35)',
    border: '1px solid rgba(255,255,255,0.18)',
    color: '#fff',
    opacity: muted ? 0.55 : 1,
  };
  switch (reward.type) {
    case 'coins':
      return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={baseStyle}>💰 {reward.value.toLocaleString()}</span>;
    case 'gems':
      return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={baseStyle}>💎 {reward.value}</span>;
    case 'shards':
      return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={baseStyle}>✨ {reward.value}</span>;
    case 'card': {
      const card = (() => { try { return getCard(reward.cardId); } catch { return null; } })();
      const emoji = card?.emoji ?? '🃏';
      return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={baseStyle}>{emoji} ×{reward.count}</span>;
    }
    case 'perk': {
      const perk = (() => { try { return getPerk(reward.perkId); } catch { return null; } })();
      const icon = perk?.icon ?? '💎';
      return <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={baseStyle}>{icon} ×{reward.count}</span>;
    }
  }
}

// ===================================================
// Tab: Achievements
// ===================================================

function AchievementsTab({ profile }: { profile: Profile }) {
  const all = allAchievements();
  const unlockedSet = new Set(profile.achievementsUnlocked);
  const unlocked = all.filter(a => unlockedSet.has(a.id));
  const locked = all.filter(a => !unlockedSet.has(a.id));

  // Sort each list by rarity (commons first, mythic last) then name.
  const sortFn = (a: Achievement, b: Achievement) => {
    const ra = rarityOrder.indexOf(a.rarity);
    const rb = rarityOrder.indexOf(b.rarity);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  };
  unlocked.sort(sortFn);
  locked.sort(sortFn);

  return (
    <div className="pb-fade-up">
      <div className="pb-panel-dark px-3 py-2 mb-3 flex items-center justify-between">
        <div className="text-sm font-extrabold">
          <span className="text-yellow-200">{unlocked.length}</span>
          <span className="opacity-70"> / {all.length} unlocked</span>
        </div>
        <div className="text-[10px] uppercase tracking-widest opacity-75 font-bold">
          {Math.round((unlocked.length / Math.max(1, all.length)) * 100)}% complete
        </div>
      </div>

      {unlocked.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-90 mb-1.5 px-1"
               style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            ⭐ Unlocked
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {unlocked.map(a => <AchievementCard key={a.id} a={a} unlocked />)}
          </div>
        </>
      )}

      <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-80 mb-1.5 px-1"
           style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
        🔒 Locked
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {locked.map(a => <AchievementCard key={a.id} a={a} unlocked={false} />)}
      </div>
    </div>
  );
}

function AchievementCard({ a, unlocked }: { a: Achievement; unlocked: boolean }) {
  const accent = rarityColor[a.rarity];
  return (
    <div
      className="rounded-xl p-2.5 flex gap-2"
      style={{
        background: unlocked ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.35)',
        border: `2px solid ${accent}`,
        color: unlocked ? '#3e2723' : '#fff',
        opacity: unlocked ? 1 : 0.7,
      }}
    >
      <div
        className="text-2xl flex-shrink-0"
        style={{ filter: unlocked ? 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))' : 'grayscale(80%)' }}
      >
        {a.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <div className="text-[12px] font-extrabold leading-tight truncate">{a.name}</div>
          <div
            className="text-[8px] uppercase tracking-widest font-extrabold px-1 py-0.5 rounded"
            style={{ background: accent, color: '#1b3a1f' }}
          >
            {a.rarity}
          </div>
        </div>
        <div className="text-[10px] opacity-80 leading-snug mt-0.5">{a.description}</div>
      </div>
    </div>
  );
}

// ===================================================
// Tab: Account
// ===================================================

function AccountTab({ profile, auth, onProfileChange }: { profile: Profile; auth: AuthStatus; onProfileChange: (p: Profile) => void }) {
  void onProfileChange;
  const [signedOut, setSignedOut] = useState(false);

  return (
    <div className="space-y-3 pb-fade-up">
      <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
        <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2" style={{ color: '#6d4c2a' }}>
          Cloud Sync
        </div>
        {auth.kind === 'cloud_disabled' && (
          <div className="text-sm">
            <div className="font-extrabold">📴 Local-only</div>
            <div className="text-[11px] opacity-80 mt-1">No Firebase configured. Progress is saved locally only.</div>
          </div>
        )}
        {auth.kind === 'signing_in' && <div className="text-sm opacity-70 font-bold">☁ Signing in…</div>}
        {auth.kind === 'error' && (
          <div className="text-sm">
            <div className="font-extrabold" style={{ color: '#c62828' }}>⚠ Sign-in error</div>
            <div className="text-[11px] opacity-80 mt-1">{auth.message}</div>
          </div>
        )}
        {auth.kind === 'signed_in' && (
          <div className="text-sm">
            <div className="font-extrabold">{auth.isAnonymous ? '👤 Anonymous account' : '✅ Signed in'}</div>
            <div className="text-[10px] opacity-65 mt-1 font-mono break-all">{auth.uid}</div>
            {profile.farmCode && (
              <div className="text-[11px] opacity-85 mt-1">
                Sigil code: <span className="font-extrabold font-mono">{profile.farmCode}</span>
              </div>
            )}
            <button
              onClick={async () => { await signOut(); setSignedOut(true); }}
              className="pb-btn pb-btn-cream pb-btn-sm mt-3"
            >
              Sign out
            </button>
            {signedOut && (
              <div className="text-[11px] opacity-75 mt-2">Reload the page to sign back in.</div>
            )}
          </div>
        )}
      </div>

      <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
        <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2" style={{ color: '#6d4c2a' }}>
          PvP Record
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg py-2" style={{ background: 'rgba(165,214,167,0.5)' }}>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-75">Wins</div>
            <div className="font-extrabold text-base mt-0.5" style={{ color: '#1b5e20' }}>{profile.pvpWins}</div>
          </div>
          <div className="rounded-lg py-2" style={{ background: 'rgba(239,154,154,0.5)' }}>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-75">Losses</div>
            <div className="font-extrabold text-base mt-0.5" style={{ color: '#b71c1c' }}>{profile.pvpLosses}</div>
          </div>
          <div className="rounded-lg py-2" style={{ background: 'rgba(189,189,189,0.5)' }}>
            <div className="text-[10px] uppercase tracking-widest font-bold opacity-75">Draws</div>
            <div className="font-extrabold text-base mt-0.5">{profile.pvpDraws}</div>
          </div>
        </div>
        <div className="text-[11px] mt-2 text-center opacity-85">
          Sigil Rating: <span className="font-extrabold" style={{ color: '#ad1457' }}>⚔ {profile.hr}</span>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`pb-btn pb-btn-${active ? 'gold' : 'cream'} pb-btn-sm flex-1 !text-[12px]`}>
      {children}
    </button>
  );
}
