// Compact daily-challenges teaser shown on the hub. Lists up to 3 daily quests
// with progress + a CTA to open the Battle Pass screen for full claim/details.

import { useMemo } from 'react';
import { selectPeriodicQuests, todayKey } from '@engine/index';
import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onOpenBattlePass?: () => void;
}

export default function DailyChallengesPanel({ profile, onOpenBattlePass }: Props) {
  const dailyQuests = useMemo(() => selectPeriodicQuests('daily', todayKey()), []);
  const todayQuests = profile.todayQuestsState ?? {};

  const claimableCount = dailyQuests.filter(q => {
    const s = todayQuests[q.id];
    return s && s.progress >= q.goal && !s.claimed;
  }).length;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: 'linear-gradient(135deg, rgba(125,211,252,0.10) 0%, rgba(8,47,73,0.18) 100%)',
        border: '1.5px solid rgba(125,211,252,0.28)',
        boxShadow: 'inset 0 1px 0 rgba(125,211,252,0.08)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚡</span>
          <div
            className="sb-display"
            style={{ fontSize: 11, color: '#bae6fd', letterSpacing: '0.18em' }}
          >
            DAILY CHALLENGES
          </div>
        </div>
        {claimableCount > 0 && (
          <button
            onClick={onOpenBattlePass}
            className="sb-mono px-2 py-0.5 rounded"
            style={{
              fontSize: 9,
              letterSpacing: '0.1em',
              background: 'linear-gradient(180deg, #fbbf24 0%, #92400e 100%)',
              border: '1px solid #fde68a',
              color: '#3b1d05',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 8px rgba(251,191,36,0.45), inset 0 1px 0 rgba(255,255,255,0.4)',
              animation: 'sb-pulse 1.5s ease-in-out infinite',
            }}
          >
            🎁 {claimableCount} READY
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {dailyQuests.slice(0, 3).map((quest) => {
          const questState = todayQuests[quest.id];
          const progress = questState?.progress ?? 0;
          const completed = progress >= quest.goal;
          const claimed = questState?.claimed ?? false;
          const pct = Math.min(100, (progress / quest.goal) * 100);

          return (
            <div
              key={quest.id}
              className="rounded-md px-2 py-1.5"
              style={{
                background: claimed ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.3)',
                border: `1px solid ${completed ? 'rgba(125,211,252,0.5)' : 'rgba(125,211,252,0.18)'}`,
                opacity: claimed ? 0.55 : 1,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="text-sm flex-shrink-0">{quest.icon}</div>
                <div
                  className="flex-1 min-w-0 truncate"
                  style={{ fontSize: 10, fontWeight: 800, color: '#e0f2fe' }}
                >
                  {quest.description}
                </div>
                <div
                  className="sb-mono flex-shrink-0"
                  style={{ fontSize: 8.5, color: '#7dd3fc', letterSpacing: '0.05em' }}
                >
                  {progress.toLocaleString()}/{quest.goal.toLocaleString()}
                </div>
              </div>
              <div
                className="h-1 rounded-full overflow-hidden"
                style={{ background: 'rgba(0,0,0,0.55)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: completed
                      ? 'linear-gradient(90deg, #7dd3fc 0%, #fbbf24 100%)'
                      : 'linear-gradient(90deg, #0c4a6e 0%, #7dd3fc 100%)',
                    boxShadow: completed ? '0 0 4px rgba(125,211,252,0.6)' : 'none',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {onOpenBattlePass && (
        <button
          onClick={onOpenBattlePass}
          className="w-full mt-2 py-1.5 rounded-md sb-mono"
          style={{
            fontSize: 9,
            letterSpacing: '0.18em',
            background: 'rgba(167,139,250,0.15)',
            border: '1px solid rgba(167,139,250,0.4)',
            color: '#c4b5fd',
            cursor: 'pointer',
            fontWeight: 700,
            transition: 'all 200ms ease',
          }}
        >
          OPEN BATTLE PASS →
        </button>
      )}
    </div>
  );
}
