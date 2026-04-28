import type { Quest } from '@engine/index';

interface Props {
  quest: Quest;
  state: { progress: number; claimed: boolean };
  onClose: () => void;
}

// Per-quest detail popover opened from the "ⓘ" badge on the home screen's
// daily-quest scroll. Keeps the brief in one place — what the goal is, how
// the engine measures progress, what the reward is — so a player who taps
// a quest never has to guess what counts toward it.

const KIND_HINTS: Record<Quest['kind'], { headline: string; how: string[] }> = {
  seasons: {
    headline: 'Plays today',
    how: [
      'Completing any season counts — Stage runs and Free Play both qualify.',
      'A run ends when the final round resolves OR Market Bell triggers an early Market Day.',
      'Quitting a run mid-season does NOT count.',
    ],
  },
  coins: {
    headline: 'Gold per battle',
    how: [
      'Counts the FINAL gold total of a single completed battle.',
      'Bonuses from objective rewards, talents, and combo multipliers all roll into the final total.',
      'A failed run (zero objectives fulfilled) only banks 20% of earnings — that reduced number is what counts.',
    ],
  },
  triple_combo: {
    headline: 'All 3 combos in one season',
    how: [
      'Trigger Abundance, Garden Variety, AND Loyal at least once each — same season.',
      'Order matters not. Spread them across rounds however you like.',
      'Variety and Loyal are mutually exclusive within a single round, so you must hit them on different rounds.',
    ],
  },
};

export default function QuestDetailModal({ quest, state, onClose }: Props) {
  const hints = KIND_HINTS[quest.kind];
  const pct = Math.min(100, Math.round((state.progress / Math.max(1, quest.goal)) * 100));
  const done = state.claimed || state.progress >= quest.goal;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="pb-panel-dark p-4 w-full max-w-sm max-h-[90vh] overflow-y-auto text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-3">
          <div
            className="text-6xl mb-1"
            style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))' }}
          >
            {quest.icon}
          </div>
          <h2 className="pb-title text-2xl">{quest.name}</h2>
          <div className="flex justify-center gap-2 mt-1.5 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
              style={{ background: '#1565c0', color: '#fff' }}
            >
              Daily Quest
            </span>
            <span
              className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(255,255,255,0.18)' }}
            >
              {hints.headline}
            </span>
            {done && (
              <span
                className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
                style={{ background: '#a5d6a7', color: '#1b3a1f' }}
              >
                ✓ Complete
              </span>
            )}
          </div>
        </div>

        {/* Objective */}
        <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80 mb-1">
            Objective
          </div>
          <p className="text-[13px] leading-relaxed">{quest.description}</p>
        </div>

        {/* Progress */}
        <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-baseline justify-between mb-1.5">
            <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80">
              Progress
            </div>
            <div className="text-[12px] font-extrabold">
              {Math.min(state.progress, quest.goal)} / {quest.goal}
            </div>
          </div>
          <div className="h-2.5 bg-black/45 rounded-full overflow-hidden relative" style={{ boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.5)' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: done
                  ? 'linear-gradient(90deg, #66bb6a 0%, #2e7d32 100%)'
                  : 'linear-gradient(90deg, #ffd54f 0%, #f9a825 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                transition: 'width 400ms ease',
              }}
            />
          </div>
          {state.claimed && (
            <div className="text-[11px] font-extrabold mt-2" style={{ color: '#a5d6a7' }}>
              ✓ Reward already claimed today
            </div>
          )}
        </div>

        {/* How it counts */}
        <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80 mb-1.5">
            How it counts
          </div>
          <ul className="text-[12px] leading-relaxed list-disc pl-4 space-y-1 opacity-95">
            {hints.how.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>

        {/* Reward */}
        <div className="rounded-lg p-2.5 mb-3" style={{ background: 'rgba(255,213,79,0.18)', border: '1.5px solid rgba(255,213,79,0.45)' }}>
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-85 mb-1">
            Reward on completion
          </div>
          <div className="flex items-center gap-2 text-sm font-extrabold">
            <span>💎 {quest.rewardGems}</span>
            <span className="opacity-65 text-[11px]">crystals</span>
          </div>
        </div>

        <p className="text-[11px] opacity-70 mb-3">
          Quests reset at <strong>00:00 UTC</strong> every day. Completed quests must be claimed before reset — uncollected crystals do not roll over.
        </p>

        <div className="flex justify-end">
          <button onClick={onClose} className="pb-btn pb-btn-cream pb-btn-md">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
