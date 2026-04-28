import { useMemo, useState } from 'react';
import type { Profile } from '@storage/index';
import { getStageDef } from '@engine/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';
import StarRatingTooltip from '@ui/components/StarRatingTooltip';

interface Props {
  profile: Profile;
  onPick: (stage: number) => void;
  onBack: () => void;
}

const PAGE_SIZE = 20;

// Linear list of stages 1..currentStage (unlocked) plus the next stage as
// a "preview" so the player can see what's next. Beyond that the list
// shows "🔒 Locked" placeholders the player can scroll through but not
// pick. Paged in groups of 20 so very-late-game players don't render 100+
// rows at once.
export default function StageSelectScreen({ profile, onPick, onBack }: Props) {
  const unlockedThrough = profile.currentStage; // includes one un-cleared stage past the last clear
  const showThrough = Math.max(unlockedThrough, 100);
  const totalPages = Math.max(1, Math.ceil(showThrough / PAGE_SIZE));
  // Default page lands on the player's current stage so they don't have to
  // scroll on every visit.
  const [page, setPage] = useState(() => Math.min(totalPages - 1, Math.floor((unlockedThrough - 1) / PAGE_SIZE)));
  const startStage = page * PAGE_SIZE + 1;
  const endStage = Math.min(showThrough, startStage + PAGE_SIZE - 1);
  const stages = useMemo(() => {
    const arr: number[] = [];
    for (let s = startStage; s <= endStage; s++) arr.push(s);
    return arr;
  }, [startStage, endStage]);

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom flex flex-col">
      <AnimatedBackground variant="menu" />
      <div className="relative z-10 px-3 pt-3 pb-2 flex items-center gap-2">
        <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Back</button>
        <h2 className="pb-title text-2xl flex-1 text-center">Stages</h2>
        <div className="text-[10px] opacity-75 font-extrabold w-16 text-right">
          {unlockedThrough}/100+
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-3xl mx-auto">
          {stages.map(s => (
            <StageCard
              key={s}
              stage={s}
              unlocked={s <= unlockedThrough}
              stars={profile.stageStars[s] ?? 0}
              isCurrent={s === unlockedThrough}
              onPick={() => onPick(s)}
            />
          ))}
        </div>
      </div>

      <div className="relative z-10 px-3 pb-3 pt-1 flex items-center justify-between gap-2">
        <button
          onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}
          className="pb-btn pb-btn-cream pb-btn-sm"
          style={{ opacity: page === 0 ? 0.4 : 1 }}
        >
          ← Prev
        </button>
        <div className="text-[11px] font-extrabold opacity-90">
          Stages {startStage}–{endStage}
        </div>
        <button
          onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
          disabled={page >= totalPages - 1}
          className="pb-btn pb-btn-cream pb-btn-sm"
          style={{ opacity: page >= totalPages - 1 ? 0.4 : 1 }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function StageCard({
  stage, unlocked, stars, isCurrent, onPick,
}: {
  stage: number;
  unlocked: boolean;
  stars: 0 | 1 | 2 | 3;
  isCurrent: boolean;
  onPick: () => void;
}) {
  const def = unlocked ? getStageDef(stage) : null;
  const isBoss = stage % 5 === 0;
  return (
    <button
      onClick={unlocked ? onPick : undefined}
      disabled={!unlocked}
      className={`relative rounded-xl p-2 text-left transition ${unlocked ? 'active:scale-95' : 'cursor-not-allowed'}`}
      style={{
        background: !unlocked
          ? 'rgba(0,0,0,0.45)'
          : isBoss
            ? 'linear-gradient(180deg, rgba(255,128,171,0.22) 0%, rgba(194,24,91,0.22) 100%)'
            : 'rgba(13,58,20,0.7)',
        border: `2px solid ${!unlocked ? 'rgba(255,255,255,0.08)' : isBoss ? 'rgba(255,128,171,0.6)' : 'rgba(106,180,123,0.5)'}`,
        boxShadow: isCurrent ? '0 0 0 2px #ffd54f, 0 4px 0 rgba(0,0,0,0.25)' : '0 3px 0 rgba(0,0,0,0.25)',
        minHeight: 90,
        opacity: unlocked ? 1 : 0.65,
      }}
    >
      <div className="flex items-baseline justify-between">
        <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-85">
          Stage
        </div>
        {isBoss && unlocked && <span className="text-base">👑</span>}
        {!unlocked && <span className="text-base">🔒</span>}
      </div>
      <div className="fredoka text-2xl mt-0.5" style={{ color: '#ffd54f' }}>
        {stage}
      </div>
      {def && (
        <div className="text-[10px] opacity-80 leading-tight mt-0.5">
          {def.orders.length} goal{def.orders.length === 1 ? '' : 's'}
        </div>
      )}
      {unlocked && (
        <div className="mt-1">
          <StarRatingTooltip placement="bottom">
            <span className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <span
                  key={i}
                  className="text-base"
                  style={{ color: stars >= i ? '#ffd54f' : 'rgba(255,255,255,0.18)' }}
                >
                  ★
                </span>
              ))}
            </span>
          </StarRatingTooltip>
        </div>
      )}
      {isCurrent && (
        <div
          className="absolute -top-1.5 -right-1.5 text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full"
          style={{
            background: '#ffd54f', color: '#4a2e00', border: '2px solid #4a2e00',
            boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
          }}
        >
          Current
        </div>
      )}
    </button>
  );
}
