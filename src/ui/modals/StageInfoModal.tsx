import { useMemo } from 'react';
import { getStageDef, type StageReward } from '@engine/index';
import type { Profile } from '@storage/index';
import StarRatingTooltip from '@ui/components/StarRatingTooltip';

interface Props {
  stage: number;
  profile: Profile;
  onStart: () => void;
  onClose: () => void;
  hardmode?: boolean;
}

// Modal that pops up before a stage run. Shows the stage's fixed orders,
// the reward chest banded by star tier (1/2/3 stars), and any best score
// the player has already posted on this stage. Pressing "Start Farming"
// kicks off the perk-loadout → run pipeline; the parent decides where to
// route based on whether the player has equipped perks etc.
export default function StageInfoModal({ stage, profile, onStart, onClose, hardmode = false }: Props) {
  const def = useMemo(() => getStageDef(stage), [stage]);
  const bestStars: number = hardmode ? (profile.hardmodeStageStars[stage] ?? 0) : (profile.stageStars[stage] ?? 0);
  const claimedTier: number = hardmode ? (profile.hardmodeRewardsClaimed[stage] ?? 0) : (profile.stageRewardsClaimed[stage] ?? 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto pb-panel-dark"
        style={{ padding: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-3">
          <div
            className="inline-block px-4 py-1 rounded-full text-[10px] uppercase tracking-widest font-extrabold mb-2"
            style={{
              background: hardmode
                ? 'linear-gradient(180deg, #d32f2f 0%, #7b1d1d 100%)'
                : def.kind === 'boss'
                ? 'linear-gradient(180deg, #ff80ab 0%, #c2185b 100%)'
                : 'linear-gradient(180deg, #66bb6a 0%, #2e7d32 100%)',
              color: '#fff',
              boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
            }}
          >
            {hardmode ? '🔥 Hardmode' : def.kind === 'boss' ? '👑 Boss Stage' : 'Stage'}
          </div>
          <h2 className="pb-title text-2xl">{def.title}</h2>
          <div className="mt-2 flex justify-center">
            <StarRatingTooltip>
              <span className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <span
                    key={i}
                    className="text-2xl"
                    style={{
                      color: bestStars >= i ? '#ffd54f' : 'rgba(255,255,255,0.18)',
                      filter: bestStars >= i ? 'drop-shadow(0 2px 3px rgba(255,213,79,0.6))' : 'none',
                    }}
                  >
                    ★
                  </span>
                ))}
              </span>
            </StarRatingTooltip>
          </div>
          <div className="text-[10px] uppercase tracking-widest opacity-65 mt-1">
            {bestStars === 0 ? 'Not yet cleared' : `Best: ${bestStars}/3 stars`}
          </div>
        </div>

        {/* Orders list */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest opacity-80 font-extrabold mb-1.5">
            Goals · {def.orders.length}
          </div>
          <div className="space-y-1.5">
            {def.orders.map(o => (
              <div
                key={o.id}
                className="rounded-lg p-2 flex items-center gap-2"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: `1.5px solid ${difficultyColor(o.difficulty)}`,
                }}
              >
                <div className="text-2xl flex-shrink-0">{o.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-extrabold truncate">{o.title}</div>
                  <div className="text-[10px] opacity-85 leading-tight mt-0.5">{o.description}</div>
                </div>
                <div
                  className="text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full flex-shrink-0"
                  style={{ background: difficultyColor(o.difficulty), color: '#1b3a1f' }}
                >
                  {difficultyLabel(o.difficulty)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Rewards by star tier */}
        <div className="mb-3">
          <div className="text-[10px] uppercase tracking-widest opacity-80 font-extrabold mb-1.5">
            Rewards · First Clear
          </div>
          <div className="space-y-1.5">
            <RewardTier
              stars={1}
              rewards={def.rewards.oneStar}
              claimed={claimedTier >= 1}
            />
            <RewardTier
              stars={2}
              rewards={def.rewards.twoStars}
              claimed={claimedTier >= 2}
            />
            <RewardTier
              stars={3}
              rewards={def.rewards.threeStars}
              claimed={claimedTier >= 3}
            />
          </div>
          <div className="text-[10px] opacity-65 mt-1.5 text-center">
            Replay clears earn gold + XP only.
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="pb-btn pb-btn-cream pb-btn-md flex-1">Cancel</button>
          <button onClick={onStart} className="pb-btn pb-btn-gold pb-btn-md flex-[2] pb-pulse">
            ▶ Begin Battle
          </button>
        </div>
      </div>
    </div>
  );
}

function difficultyColor(d: 1 | 2 | 3): string {
  return d === 1 ? '#a5d6a7' : d === 2 ? '#ffd54f' : '#ff80ab';
}
function difficultyLabel(d: 1 | 2 | 3): string {
  return d === 1 ? 'Easy' : d === 2 ? 'Med' : 'Hard';
}

function RewardTier({ stars, rewards, claimed }: { stars: 1 | 2 | 3; rewards: StageReward[]; claimed: boolean }) {
  return (
    <div
      className="rounded-lg p-2 flex items-center gap-2"
      style={{
        background: claimed ? 'rgba(46,125,50,0.25)' : 'rgba(255,255,255,0.06)',
        border: `1.5px solid ${claimed ? 'rgba(165,214,167,0.55)' : 'rgba(255,213,79,0.35)'}`,
        opacity: claimed ? 0.7 : 1,
      }}
    >
      <div className="flex-shrink-0 flex items-center" style={{ minWidth: 50 }}>
        <StarRatingTooltip highlightTier={stars} placement="bottom">
          <span className="flex">
            {Array.from({ length: stars }).map((_, i) => (
              <span key={i} className="text-base" style={{ color: '#ffd54f' }}>★</span>
            ))}
          </span>
        </StarRatingTooltip>
      </div>
      <div className="flex-1 flex flex-wrap gap-1.5 text-[11px] font-extrabold">
        {rewards.map((r, i) => (
          <RewardChip key={i} reward={r} />
        ))}
      </div>
      {claimed && (
        <div className="text-[10px] uppercase tracking-widest font-extrabold flex-shrink-0" style={{ color: '#a5d6a7' }}>
          ✓ Claimed
        </div>
      )}
    </div>
  );
}

function RewardChip({ reward }: { reward: StageReward }) {
  const { icon, label } = chipFor(reward);
  return (
    <span
      className="px-1.5 py-0.5 rounded-md flex items-center gap-1"
      style={{
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function chipFor(r: StageReward): { icon: string; label: string } {
  switch (r.type) {
    case 'coins':  return { icon: '🪙', label: `+${r.value}` };
    case 'gems':   return { icon: '💎', label: `+${r.value}` };
    case 'shards': return { icon: '🔷', label: `+${r.value}` };
    case 'xp':     return { icon: '⭐', label: `+${r.value} XP` };
    case 'card':   return { icon: '🃏', label: `${r.cardId?.split('.').pop()} ×${r.count}` };
    case 'perk':   return { icon: '🌟', label: `${r.perkId?.split('.').pop()} ×${r.count}` };
  }
}
