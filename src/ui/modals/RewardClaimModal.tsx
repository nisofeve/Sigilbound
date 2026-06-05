import { useEffect, useState } from 'react';
import { getAction, getTactic, type CardId } from '@engine/index';
import { CombatCard } from '@ui/components/CombatCard';

// Single shared reward shape across all claim sources (level-up, battle pass,
// daily quest). The modal renders one chip per reward.
export type ClaimableReward =
  | { type: 'coins';  value: number }
  | { type: 'gems';   value: number }
  | { type: 'shards'; value: number }
  | { type: 'card';   cardId: CardId; count: number }
  | { type: 'perk';   perkId: string; perkName: string; perkIcon: string };

export interface UnlockedUpgrade {
  name: string;
  description: string;
  zone: string;
}

interface Props {
  // Where the reward came from — drives the title and accent color so the
  // player has a sense of which system just paid out.
  source: 'level' | 'battle_pass' | 'daily_quest';
  // Optional flavor — e.g., "Level 17", "Tier 8 (Premium)", quest name.
  subtitle?: string;
  rewards: ClaimableReward[];
  // Stronghold upgrades that just became visible at this level.
  unlockedUpgrades?: UnlockedUpgrade[];
  onClose: () => void;
}

const SOURCE_META: Record<Props['source'], { title: string; accent: string; emoji: string }> = {
  level:        { title: 'Level Up Reward!',  accent: '#80deea', emoji: '⭐' },
  battle_pass:  { title: 'Battle Pass Reward!', accent: '#ffd54f', emoji: '🎫' },
  daily_quest:  { title: 'Daily Quest Reward!', accent: '#a5d6a7', emoji: '🎯' },
};

export default function RewardClaimModal({ source, subtitle, rewards, unlockedUpgrades, onClose }: Props) {
  const meta = SOURCE_META[source];
  // Stagger the reward-chip pop-ins so the eye walks across them.
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (rewards.length === 0) return;
    if (revealed >= rewards.length) return;
    const id = window.setTimeout(() => setRevealed(n => Math.min(rewards.length, n + 1)), 180);
    return () => window.clearTimeout(id);
  }, [revealed, rewards.length]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 safe-top safe-bottom">
      <div
        className="pb-panel max-w-md w-full p-5 sm:p-6 pb-pop-in relative"
        style={{ color: '#3e2723' }}
      >
        <div className="relative">
          <div className="text-center mb-4">
            <div
              className="text-6xl sm:text-7xl mb-2 inline-block pb-bob"
              style={{ filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.3))', animationDuration: '2.6s' }}
            >
              {meta.emoji}
            </div>
            <h2
              className="fredoka text-2xl sm:text-3xl"
              style={{ color: '#1b3a1f', textShadow: '0 2px 0 rgba(255,255,255,0.4)' }}
            >
              {meta.title}
            </h2>
            {subtitle && (
              <div
                className="text-[11px] uppercase tracking-[0.3em] font-extrabold mt-1.5"
                style={{ color: '#6d4c2a' }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Reward chips. Each chip pops in on a stagger. */}
          <div
            className="rounded-xl p-3 mb-4"
            style={{
              background: 'rgba(255,255,255,0.55)',
              border: `2px solid ${meta.accent}`,
            }}
          >
            <div
              className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2 text-center"
              style={{ color: '#6d4c2a' }}
            >
              You earned
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {rewards.map((r, i) => (
                <RewardChip key={i} reward={r} visible={i < revealed} />
              ))}
            </div>
          </div>

          {unlockedUpgrades && unlockedUpgrades.length > 0 && (
            <div
              className="rounded-xl p-3 mb-4"
              style={{
                background: 'rgba(251,191,36,0.12)',
                border: '1.5px solid rgba(251,191,36,0.4)',
              }}
            >
              <div
                className="text-[10px] uppercase tracking-[0.3em] font-extrabold mb-2 text-center flex items-center justify-center gap-1.5"
                style={{ color: '#92400e' }}
              >
                🏰 New Stronghold Upgrades Available
              </div>
              <div className="flex flex-col gap-1.5">
                {unlockedUpgrades.map((u, i) => (
                  <div
                    key={i}
                    className="rounded-lg px-3 py-1.5 flex items-start gap-2"
                    style={{
                      background: 'rgba(255,255,255,0.45)',
                      border: '1px solid rgba(120,80,30,0.3)',
                    }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1.4 }}>✦</span>
                    <div>
                      <div className="font-extrabold text-[11px]" style={{ color: '#3e2723' }}>{u.name}</div>
                      <div className="text-[10px] opacity-75" style={{ color: '#5d4037' }}>{u.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={onClose}
            className="pb-btn pb-btn-gold pb-btn-md w-full pb-pulse"
            disabled={revealed < rewards.length}
          >
            {revealed < rewards.length ? '…' : '✓ Collect'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RewardChip({ reward, visible }: { reward: ClaimableReward; visible: boolean }) {
  // Fade + scale up when revealed. Stays in DOM beforehand so layout is
  // stable — chips occupy their final slot but invisible until their turn.
  const baseStyle: React.CSSProperties = {
    background: 'linear-gradient(180deg, #fffaf2 0%, #f5e8c8 100%)',
    border: '2px solid rgba(120,80,30,0.4)',
    boxShadow: '0 3px 0 rgba(0,0,0,0.18)',
    color: '#3e2723',
    transition: 'opacity 220ms ease-out, transform 220ms cubic-bezier(0.2,0.8,0.2,1)',
    opacity: visible ? 1 : 0,
    transform: visible ? 'scale(1)' : 'scale(0.6)',
  };
  if (reward.type === 'coins') {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={baseStyle}>
        <span className="text-2xl" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>💰</span>
        <span className="font-extrabold text-base" style={{ color: '#c17900' }}>
          +{reward.value.toLocaleString()}
        </span>
      </div>
    );
  }
  if (reward.type === 'gems') {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={baseStyle}>
        <span className="text-2xl" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>💎</span>
        <span className="font-extrabold text-base" style={{ color: '#0277bd' }}>
          +{reward.value}
        </span>
      </div>
    );
  }
  if (reward.type === 'shards') {
    return (
      <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={baseStyle}>
        <span className="text-2xl" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>✨</span>
        <span className="font-extrabold text-base" style={{ color: '#ad1457' }}>
          +{reward.value}
        </span>
      </div>
    );
  }
  if (reward.type === 'card') {
    const def = getAction(reward.cardId) ?? getTactic(reward.cardId);
    return (
      <div
        className="flex flex-col items-center gap-1"
        style={{
          transition: 'opacity 220ms ease-out, transform 220ms cubic-bezier(0.2,0.8,0.2,1)',
          opacity: visible ? 1 : 0,
          transform: visible ? 'scale(1)' : 'scale(0.6)',
        }}
      >
        {def ? (
          <CombatCard card={def} size="sm" />
        ) : (
          <span className="text-4xl">🃏</span>
        )}
        <div className="flex flex-col items-center leading-tight" style={{ color: '#3e2723' }}>
          <span className="font-extrabold text-[11px]">{def?.name ?? reward.cardId}</span>
          {reward.count > 1 && <span className="text-[10px] opacity-75 font-bold">×{reward.count}</span>}
        </div>
      </div>
    );
  }
  // perk
  return (
    <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={baseStyle}>
      <span className="text-2xl" style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}>
        {reward.perkIcon}
      </span>
      <div className="flex flex-col items-start leading-tight">
        <span className="font-extrabold text-[12px]">{reward.perkName}</span>
        <span className="text-[10px] opacity-75 font-bold">Talent Unlocked</span>
      </div>
    </div>
  );
}
