import { useMemo } from 'react';
import { selectDailyQuests } from '@engine/quests';
import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onQuestClaim?: (questId: string) => void;
}

export default function DailyChallengesPanel({ profile, onQuestClaim }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const dailyQuests = useMemo(() => selectDailyQuests(today), [today]);
  const todayQuests = profile.todayQuestsState ?? {};

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(255,193,7,0.08) 0%, rgba(255,152,0,0.04) 100%)',
        border: '1.5px solid rgba(255,193,7,0.2)',
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">⚡</span>
        <h2 className="pb-title text-lg">Daily Challenges</h2>
      </div>

      <div className="space-y-2">
        {dailyQuests.slice(0, 3).map((quest) => {
          const questState = todayQuests[quest.id];
          const progress = questState?.progress ?? 0;
          const completed = progress >= quest.goal;
          const claimed = questState?.claimed ?? false;

          return (
            <div
              key={quest.id}
              className="rounded-lg p-2 flex items-center gap-2"
              style={{
                background: completed ? 'rgba(76,175,80,0.1)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${completed ? 'rgba(165,214,167,0.3)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <div className="text-lg flex-shrink-0">{quest.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-extrabold truncate">{quest.name}</div>
                <div className="w-full bg-gray-700 rounded-full h-1 mt-0.5">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (progress / quest.goal) * 100)}%`,
                      background: completed ? '#66bb6a' : '#ffc107',
                    }}
                  />
                </div>
              </div>
              <div className="flex-shrink-0 text-[10px] text-right">
                <div>{progress}/{quest.goal}</div>
              </div>
              {completed && !claimed && (
                <button
                  onClick={() => onQuestClaim?.(quest.id)}
                  className="pb-btn pb-btn-gold pb-btn-sm flex-shrink-0"
                  title="Claim reward"
                >
                  ✓
                </button>
              )}
              {claimed && (
                <span className="text-[10px] flex-shrink-0 opacity-60">✓ Claimed</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] opacity-60 mt-3 text-center">
        Quests reset daily • Complete 3 challenges for bonus rewards
      </div>
    </div>
  );
}
