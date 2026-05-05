import { useMemo, useState } from 'react';
import {
  ACHIEVEMENT_REWARDS,
  achievementsByCategory,
  allAchievements,
  predicateProgress,
  type Achievement,
  type AchievementCategory,
  type Rarity,
} from '@engine/index';
import { claimAchievementReward, saveProfile, type Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onBack: () => void;
  onProfileChange: (p: Profile) => void;
}

const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7', uncommon: '#90caf9', rare: '#ce93d8',
  epic: '#ffab76', legendary: '#ffd54f', mythic: '#ff8a65',
};
const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

const categoryLabels: Record<AchievementCategory, string> = {
  beginner: 'Initiate', harvest: 'Conqueror', combo_master: 'Combo Master',
  tycoon: 'Treasury', veteran: 'Veteran', deck_builder: 'Sigilsmith',
  social: 'Vanguard', mythic: 'Mythic', tool_wizard: 'Battle Pass', farmstead: 'Stronghold',
};

export default function AchievementsScreen({ profile, onBack, onProfileChange }: Props) {
  const [filterCategory, setFilterCategory] = useState<'all' | AchievementCategory>('all');
  const [filterRarity, setFilterRarity] = useState<'all' | Rarity>('all');
  const [showOnly, setShowOnly] = useState<'all' | 'unlocked' | 'locked'>('all');
  const owned = useMemo(() => new Set(profile.achievementsUnlocked), [profile.achievementsUnlocked]);
  const claimed = useMemo(() => new Set(profile.achievementsClaimed ?? []), [profile.achievementsClaimed]);

  const grouped = achievementsByCategory();
  const categories = Object.keys(grouped) as AchievementCategory[];

  const all = allAchievements();
  const filtered = all.filter(a => {
    if (filterCategory !== 'all' && a.category !== filterCategory) return false;
    if (filterRarity !== 'all' && a.rarity !== filterRarity) return false;
    if (showOnly === 'unlocked' && !owned.has(a.id)) return false;
    if (showOnly === 'locked' && owned.has(a.id)) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    const aOwned = owned.has(a.id) ? 0 : 1;
    const bOwned = owned.has(b.id) ? 0 : 1;
    if (aOwned !== bOwned) return aOwned - bOwned;
    return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
  });

  const totalCount = all.length;
  const ownedCount = owned.size;
  const completionPct = Math.round((ownedCount / totalCount) * 100);

  function handleClaim(id: string) {
    const next = claimAchievementReward(profile, id);
    if (!next) return;
    saveProfile(next);
    onProfileChange(next);
  }

  return (
    <div className="h-full w-full overflow-y-auto text-white safe-top safe-bottom" style={{ background: 'linear-gradient(180deg, #1b3a1f 0%, #0d3a14 100%)' }}>
      <div className="max-w-2xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="text-xs px-3 py-1.5 rounded-lg bg-white/10 active:bg-white/20">← Settings</button>
          <div className="text-xs opacity-70">
            <span className="font-bold text-white">{ownedCount}</span> / {totalCount}
            <span className="opacity-50 ml-1">({completionPct}%)</span>
          </div>
        </div>

        <h1 className="fredoka text-2xl sm:text-3xl mb-1">🏆 Achievements</h1>
        <p className="text-[11px] opacity-70 mb-3">
          Phase 6 ships {totalCount} achievements demonstrating the full system.
          The remaining {999 - totalCount} are content for upcoming releases.
        </p>

        {/* Progress bar */}
        <div className="h-2 bg-black/30 rounded mb-4">
          <div className="h-2 rounded" style={{ width: `${completionPct}%`, background: '#f9a825' }} />
        </div>

        {/* Filter row */}
        <div className="flex gap-2 mb-3 flex-wrap">
          <FilterPill active={showOnly === 'all'}      onClick={() => setShowOnly('all')}     >All ({totalCount})</FilterPill>
          <FilterPill active={showOnly === 'unlocked'} onClick={() => setShowOnly('unlocked')}>✓ Unlocked ({ownedCount})</FilterPill>
          <FilterPill active={showOnly === 'locked'}   onClick={() => setShowOnly('locked')}  >🔒 Locked ({totalCount - ownedCount})</FilterPill>
        </div>

        <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
          <FilterChip active={filterCategory === 'all'} onClick={() => setFilterCategory('all')}>All</FilterChip>
          {categories.map(c => (
            <FilterChip key={c} active={filterCategory === c} onClick={() => setFilterCategory(c)}>
              {categoryLabels[c] ?? c} ({grouped[c].length})
            </FilterChip>
          ))}
        </div>

        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <FilterChip active={filterRarity === 'all'} onClick={() => setFilterRarity('all')}>Any rarity</FilterChip>
          {rarityOrder.map(r => (
            <FilterChip key={r} active={filterRarity === r} onClick={() => setFilterRarity(r)}>
              <span style={{ color: rarityColor[r] }}>● </span>{r}
            </FilterChip>
          ))}
        </div>

        {/* Achievement list */}
        {sorted.length === 0 ? (
          <div className="text-xs opacity-60 text-center py-8">No achievements match these filters.</div>
        ) : (
          <div className="space-y-1.5">
            {sorted.map(a => (
              <AchievementRow
                key={a.id}
                achievement={a}
                owned={owned.has(a.id)}
                claimed={claimed.has(a.id)}
                profile={profile}
                onClaim={() => handleClaim(a.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-lg font-bold ${active ? 'bg-white/20' : 'bg-white/5 active:bg-white/15'}`}
    >
      {children}
    </button>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-md whitespace-nowrap ${active ? 'bg-white/20 text-white' : 'bg-white/5 text-white/70 active:bg-white/15'}`}
    >
      {children}
    </button>
  );
}

function AchievementRow({ achievement: a, owned, claimed, profile, onClaim }: {
  achievement: Achievement;
  owned: boolean;
  claimed: boolean;
  profile: Profile;
  onClaim: () => void;
}) {
  const reward = ACHIEVEMENT_REWARDS[a.rarity];
  const progress = predicateProgress(a.predicate, {
    profile: {
      seasonsPlayed: profile.seasonsPlayed,
      totalCoinsEarned: profile.totalCoinsEarned,
      bankCoins: profile.bankCoins,
      lifetimeCombos: profile.lifetimeCombos,
      bestRating: profile.bestRating,
      pvpWins: profile.pvpWins,
      friends: profile.friends,
      upgradesOwned: profile.upgradesOwned,
      perksOwned: profile.perksOwned,
      bpXp: profile.bpXp,
      bpPremium: profile.bpPremium,
      achievementsUnlocked: profile.achievementsUnlocked,
    },
  });
  const pct = progress ? Math.min(100, Math.round((progress.current / progress.goal) * 100)) : (owned ? 100 : 0);
  const claimable = owned && !claimed;

  return (
    <div
      className={`flex items-start gap-3 p-2.5 rounded-lg border ${owned ? 'bg-yellow-900/20 border-yellow-300/30' : 'bg-white/5 border-white/10'}`}
      style={{ borderLeft: `3px solid ${rarityColor[a.rarity]}` }}
    >
      <div className={`text-2xl ${owned ? '' : 'grayscale opacity-50'}`}>{a.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-sm font-bold">{a.name}</div>
          <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: rarityColor[a.rarity] }}>{a.rarity}</div>
          {claimed && <div className="text-[10px] text-yellow-200">✓ Claimed</div>}
          {claimable && <div className="text-[10px] text-green-300">● Ready</div>}
        </div>
        <div className="text-[11px] opacity-70 leading-snug">{a.description}</div>
        {progress && !owned && (
          <div className="mt-1">
            <div className="h-1 bg-white/10 rounded">
              <div className="h-1 rounded" style={{ width: `${pct}%`, background: rarityColor[a.rarity] }} />
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">{progress.current.toLocaleString()} / {progress.goal.toLocaleString()}</div>
          </div>
        )}
        {owned && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] opacity-60">+{reward.coins} 💰 +{reward.gems} 💎</span>
            {claimable && (
              <button
                onClick={onClaim}
                className="text-[10px] font-bold px-2 py-0.5 rounded-md active:opacity-70"
                style={{ background: 'rgba(249,168,37,0.25)', border: '1px solid rgba(249,168,37,0.5)', color: '#fde68a' }}
              >
                Claim
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
