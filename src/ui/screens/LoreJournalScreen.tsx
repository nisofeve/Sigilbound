import { useMemo } from 'react';
import { allLoreMilestones, loreUnlockedForStage } from '@engine/lore';
import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onClose: () => void;
}

export default function LoreJournalScreen({ profile, onClose }: Props) {
  const milestones = useMemo(() => allLoreMilestones(), []);
  const unlockedStages = profile.loreMilestonesUnlocked ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg"
        style={{ background: 'linear-gradient(135deg, #2a1a3a 0%, #1a0f2a 100%)', padding: 24 }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="pb-title text-2xl mb-1">📖 Lore Journal</h1>
          <p className="text-[12px] opacity-70">
            {unlockedStages.length} / {milestones.length} Milestones Unlocked
          </p>
        </div>

        {/* Milestones */}
        <div className="space-y-3 mb-6">
          {milestones.map((m) => {
            const unlocked = loreUnlockedForStage(m.stage, unlockedStages);
            const isNew = false;

            return (
              <div
                key={m.stage}
                className="rounded-lg p-4 transition-all"
                style={{
                  background: unlocked
                    ? 'linear-gradient(135deg, rgba(200,120,160,0.15) 0%, rgba(180,80,140,0.08) 100%)'
                    : 'rgba(255,255,255,0.04)',
                  border: unlocked
                    ? '1.5px solid rgba(200,120,160,0.3)'
                    : '1px solid rgba(255,255,255,0.1)',
                  opacity: unlocked ? 1 : 0.65,
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1">
                    {unlocked ? (
                      <span className="text-xl">⭐</span>
                    ) : (
                      <span className="text-xl opacity-40">🔒</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="pb-title text-[14px]">
                        {unlocked ? m.title : `Stage ${m.stage} — ???`}
                      </h3>
                      {isNew && unlocked && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full font-extrabold" style={{ background: '#ffd54f', color: '#4a2e00' }}>
                          NEW
                        </span>
                      )}
                    </div>
                    {unlocked && (
                      <>
                        <p className="text-[11px] opacity-75 leading-relaxed mb-2">{m.text}</p>
                        <div className="text-[10px] opacity-60">
                          Reward: <strong>{m.rewardCosmeticLabel}</strong>
                        </div>
                      </>
                    )}
                    {!unlocked && (
                      <p className="text-[11px] opacity-50">Clear stage {m.stage} to unlock this lore</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="pb-btn pb-btn-cream pb-btn-md w-full">
          ← Back
        </button>
      </div>
    </div>
  );
}
