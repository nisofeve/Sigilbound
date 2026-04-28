import { useState } from 'react';
import type { OrderSummary, Rating, RunResult, StageReward } from '@engine/index';
import { getAchievement, getQuest } from '@engine/index';
import type { Profile, StageRunOutcome } from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';
import RewardClaimModal, { type ClaimableReward } from '@ui/modals/RewardClaimModal';
import StarRatingTooltip from '@ui/components/StarRatingTooltip';

interface Props {
  result: RunResult;
  profile: Profile;
  isNewBest: boolean;
  questsCompleted: string[];
  gemsAwarded: number;
  achievementsUnlocked: string[];
  stageOutcome: StageRunOutcome | null;
  isPvp?: boolean;
  onPlayAgain: () => void;
  onNextStage: () => void;
  onHome: () => void;
}

const ratingMeta: Record<Rating, { label: string; color: string; emoji: string; tagline: string; sparkles: number }> = {
  fail:    { label: 'Failed',    color: '#bf360c', emoji: '💀', tagline: 'Better luck next season.',         sparkles: 0 },
  survive: { label: 'Survived',  color: '#8d6e63', emoji: '🌱', tagline: 'You made it through. Keep going!', sparkles: 4 },
  bronze:  { label: 'Bronze',    color: '#d7956b', emoji: '🥉', tagline: 'A profitable harvest.',            sparkles: 8 },
  silver:  { label: 'Silver',    color: '#cfd8dc', emoji: '🥈', tagline: 'A fine season.',                   sparkles: 12 },
  gold:    { label: 'Gold',      color: '#ffd54f', emoji: '🥇', tagline: 'Legendary harvest!',               sparkles: 18 },
  mythic:  { label: 'Mythic',    color: '#ff80ab', emoji: '👑', tagline: 'Once-in-a-lifetime.',              sparkles: 28 },
};

export default function ResultsScreen({ result, profile, isNewBest, questsCompleted, gemsAwarded, achievementsUnlocked, stageOutcome, isPvp, onPlayAgain, onNextStage, onHome }: Props) {
  const meta = ratingMeta[result.rating];
  const total = result.combosTotal.onslaught + result.combosTotal.triadic + result.combosTotal.relentless;
  const isStageRun = stageOutcome !== null;
  const cleared = isStageRun && (stageOutcome?.stars ?? 0) >= 1;

  // Daily-quest reward popup. Auto-opens once at mount when this run
  // completed at least one quest. The player dismisses with Collect; the
  // results breakdown is still listed in the body of the page underneath.
  const [questPopupOpen, setQuestPopupOpen] = useState(questsCompleted.length > 0);
  const questRewards: ClaimableReward[] = gemsAwarded > 0 ? [{ type: 'gems', value: gemsAwarded }] : [];
  const questSubtitle = questsCompleted.length === 1
    ? (getQuest(questsCompleted[0])?.name ?? 'Daily Quest')
    : `${questsCompleted.length} daily quests`;

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={meta.sparkles > 0 ? 0 : 5} />

      {/* Celebration sparkles burst over the page when result is bronze+ */}
      {meta.sparkles > 0 && (
        <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
          {Array.from({ length: meta.sparkles }).map((_, i) => (
            <div
              key={i}
              className="absolute pb-leaf"
              style={{
                top: 0,
                left: `${(i * 17 + Math.random() * 6) % 100}%`,
                fontSize: 14 + Math.round(Math.random() * 18),
                animationDuration: `${8 + Math.random() * 7}s`,
                animationDelay: `${-Math.random() * 12}s`,
              }}
            >
              {result.rating === 'mythic' ? '👑' : result.rating === 'gold' ? '✨' : result.rating === 'silver' ? '⭐' : '🌟'}
            </div>
          ))}
        </div>
      )}

      <div className="relative z-20 h-full overflow-y-auto flex flex-col items-center px-4 py-6">
        {/* Hero rating banner */}
        <div className="text-center mb-5 sm:mb-6 pb-pop-in">
          <div
            className="text-7xl sm:text-8xl mb-2 inline-block pb-bob"
            style={{ filter: `drop-shadow(0 6px 12px ${meta.color}99)`, animationDuration: '3s' }}
          >
            {meta.emoji}
          </div>
          <div className="pb-title text-4xl sm:text-6xl" style={{ color: meta.color }}>
            {meta.label}
          </div>
          <div className="text-sm sm:text-base font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {meta.tagline}
          </div>
          {isNewBest && (
            <div
              className="mt-4 inline-block px-4 py-1.5 rounded-full text-sm font-extrabold pb-pulse"
              style={{
                background: 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)',
                color: '#4a2e00',
                border: '2px solid rgba(255,243,176,0.7)',
                boxShadow: '0 4px 0 rgba(0,0,0,0.2)',
              }}
            >
              ✨ New Personal Best!
            </div>
          )}
        </div>

        {isStageRun && stageOutcome && (
          <div className="w-full max-w-md mb-3 pb-fade-up" style={{ animationDelay: '0.02s' }}>
            <StageOutcomePanel outcome={stageOutcome} />
          </div>
        )}

        {isPvp && (
          <div className="w-full max-w-md mb-3 pb-fade-up">
            <div className="pb-panel-dark px-4 py-3 text-center" style={{ borderColor: '#c2185b' }}>
              <div className="text-[10px] uppercase tracking-widest font-extrabold" style={{ color: '#f48fb1' }}>
                ⚔ PvP Match Submitted
              </div>
              <div className="text-xs opacity-90 mt-1">
                Result sent to opponent. Open <strong>Social → PvP</strong> for HR change.
              </div>
            </div>
          </div>
        )}

        {achievementsUnlocked.length > 0 && (
          <div className="w-full max-w-md mb-3 pb-fade-up" style={{ animationDelay: '0.05s' }}>
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <div className="text-[10px] uppercase tracking-widest font-extrabold mb-2 flex items-center gap-1" style={{ color: '#c17900' }}>
                🏆 {achievementsUnlocked.length} Achievement{achievementsUnlocked.length > 1 ? 's' : ''} Unlocked
              </div>
              <ul className="text-xs space-y-1.5">
                {achievementsUnlocked.map(id => {
                  const a = getAchievement(id);
                  return a ? (
                    <li key={id} className="flex items-center gap-2">
                      <span className="text-xl">{a.icon}</span>
                      <span className="font-extrabold">{a.name}</span>
                      <span className="opacity-70 text-[11px]">— {a.description}</span>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          </div>
        )}

        {questsCompleted.length > 0 && (
          <div className="w-full max-w-md mb-3 pb-fade-up" style={{ animationDelay: '0.1s' }}>
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <div className="text-[10px] uppercase tracking-widest font-extrabold mb-2" style={{ color: '#1565c0' }}>
                🎯 Quests completed (+{gemsAwarded} 💎)
              </div>
              <ul className="text-xs space-y-1">
                {questsCompleted.map(id => {
                  const q = getQuest(id);
                  return q ? (
                    <li key={id} className="flex items-center gap-2 font-bold">
                      <span className="text-base">{q.icon}</span> {q.name}
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          </div>
        )}

        {/* Final coins + combos */}
        <div className="w-full max-w-md mb-4 pb-fade-up" style={{ animationDelay: '0.15s' }}>
          <div className="pb-panel-dark px-5 py-4">
            <div className="flex items-baseline justify-between mb-4">
              <div className="text-[10px] uppercase tracking-widest opacity-75 font-extrabold">Final Coins</div>
              <div className="fredoka text-4xl" style={{ color: '#ffd54f', textShadow: '0 2px 0 rgba(0,0,0,0.3)' }}>
                💰 {result.finalCoins}
              </div>
            </div>
            <div className="text-[10px] uppercase tracking-widest opacity-75 font-extrabold mb-2">
              Combos Triggered ({total})
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <ComboStat icon="⚔️" label="Onslaught" value={result.combosTotal.onslaught} color="#fff176" />
              <ComboStat icon="🌈" label="Triadic"   value={result.combosTotal.triadic} color="#80deea" />
              <ComboStat icon="🔁" label="Relentless" value={result.combosTotal.relentless} color="#f8bbd0" />
            </div>
          </div>
        </div>

        {/* Order summary — fulfilled vs unfulfilled, with rewards earned. */}
        {result.orders && result.orders.length > 0 && (
          <div className="w-full max-w-md mb-4 pb-fade-up" style={{ animationDelay: '0.18s' }}>
            <OrderSummaryPanel orders={result.orders} />
          </div>
        )}

        {/* Lifetime stats */}
        <div className="w-full max-w-md mb-6 grid grid-cols-3 gap-2 text-center pb-fade-up" style={{ animationDelay: '0.2s' }}>
          <LifetimeStat label="Battles" value={profile.seasonsPlayed} />
          <LifetimeStat label="Lifetime Coins" value={profile.totalCoinsEarned} />
          <LifetimeStat label="Best Score" value={profile.bestScore} />
        </div>

        <div className="flex gap-3 pb-fade-up flex-wrap justify-center" style={{ animationDelay: '0.25s' }}>
          <button onClick={onHome} className="pb-btn pb-btn-cream pb-btn-md">🏡 Home</button>
          {isStageRun ? (
            <>
              <button onClick={onPlayAgain} className="pb-btn pb-btn-wood pb-btn-md">
                🔁 Replay Stage
              </button>
              {cleared && (
                <button onClick={onNextStage} className="pb-btn pb-btn-gold pb-btn-lg pb-pulse">
                  ▶ Next Stage
                </button>
              )}
            </>
          ) : (
            <button onClick={onPlayAgain} className="pb-btn pb-btn-gold pb-btn-lg pb-pulse">
              ▶ Next Battle
            </button>
          )}
        </div>
      </div>

      {/* Daily-quest reward popup — auto-opens on mount if any quest finished
          this run. The full per-quest list is still rendered above so the
          player can review what they accomplished after dismissing. */}
      {questPopupOpen && questRewards.length > 0 && (
        <RewardClaimModal
          source="daily_quest"
          subtitle={questSubtitle}
          rewards={questRewards}
          onClose={() => setQuestPopupOpen(false)}
        />
      )}
    </div>
  );
}

function ComboStat({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'rgba(255,255,255,0.06)',
        border: '2px solid rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
      }}
    >
      <div className="text-2xl">{icon}</div>
      <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1 font-bold">{label}</div>
      <div className="fredoka text-2xl mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function LifetimeStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="pb-panel-dark px-2 py-2">
      <div className="text-[9px] opacity-75 uppercase tracking-widest font-bold">{label}</div>
      <div className="font-extrabold text-base mt-0.5" style={{ color: '#ffd54f' }}>{value}</div>
    </div>
  );
}

// Renders the post-run breakdown of the player's orders: which were
// fulfilled (with the bonus coins they paid out) and which were left
// unfinished (with progress / goal so the player can see how close they
// got). Sorted fulfilled-first so the wins are the first thing the eye
// catches.
function OrderSummaryPanel({ orders }: { orders: OrderSummary[] }) {
  const fulfilled = orders.filter(o => o.fulfilled);
  const unfulfilled = orders.filter(o => !o.fulfilled);
  const earnedFromOrders = fulfilled.reduce((n, o) => n + o.reward, 0);

  return (
    <div className="pb-panel-dark px-3 py-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-widest opacity-80 font-extrabold">Orders</div>
        <div className="text-[11px] font-extrabold">
          <span className="text-emerald-200">{fulfilled.length}</span>
          <span className="opacity-50"> / {orders.length} fulfilled</span>
          {earnedFromOrders > 0 && (
            <span className="text-yellow-200 ml-2">+{earnedFromOrders}c</span>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        {fulfilled.map(o => <OrderResultRow key={o.id} order={o} />)}
        {unfulfilled.map(o => <OrderResultRow key={o.id} order={o} />)}
      </div>
    </div>
  );
}

function StageOutcomePanel({ outcome }: { outcome: StageRunOutcome }) {
  const stars = outcome.stars;
  const cleared = stars >= 1;
  const headline = !cleared
    ? `Stage ${outcome.stageNumber} · No Stars`
    : stars === 3
      ? `Stage ${outcome.stageNumber} · Perfect Clear!`
      : `Stage ${outcome.stageNumber} · Cleared`;
  const accent = !cleared ? '#bf360c' : stars === 3 ? '#ffd54f' : stars === 2 ? '#cfd8dc' : '#a5d6a7';
  return (
    <div className="pb-panel-dark px-4 py-3" style={{ borderColor: accent }}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80">
            {cleared ? 'Stage Cleared' : 'Stage Failed'}
          </div>
          <div className="fredoka text-xl mt-0.5" style={{ color: accent }}>
            {headline}
          </div>
        </div>
        <div className="flex-shrink-0">
          <StarRatingTooltip
            highlightTier={stars >= 1 ? (stars as 1 | 2 | 3) : undefined}
            placement="bottom"
          >
            <span className="flex gap-0.5">
              {[1, 2, 3].map(i => (
                <span
                  key={i}
                  className="text-3xl"
                  style={{
                    color: stars >= i ? '#ffd54f' : 'rgba(255,255,255,0.18)',
                    filter: stars >= i ? 'drop-shadow(0 2px 3px rgba(255,213,79,0.6))' : 'none',
                  }}
                >
                  ★
                </span>
              ))}
            </span>
          </StarRatingTooltip>
        </div>
      </div>

      {outcome.rewardsGranted.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-widest font-extrabold mt-3 mb-1.5"
               style={{ color: outcome.firstClearAtTier > 0 ? '#ffd54f' : 'rgba(255,255,255,0.7)' }}>
            {outcome.firstClearAtTier > 0
              ? `🎁 First-Clear Chest · ${outcome.firstClearAtTier}★ Tier`
              : '🔁 Replay Reward'}
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-extrabold">
            {outcome.rewardsGranted.map((r, i) => (
              <StageRewardChip key={i} reward={r} />
            ))}
          </div>
          {!cleared && (
            <div className="text-[10px] opacity-75 mt-2">
              Fulfill at least one order to earn a star.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StageRewardChip({ reward }: { reward: StageReward }) {
  const { icon, label } = (() => {
    switch (reward.type) {
      case 'coins':  return { icon: '🪙', label: `+${reward.value}` };
      case 'gems':   return { icon: '💎', label: `+${reward.value}` };
      case 'shards': return { icon: '🔷', label: `+${reward.value}` };
      case 'xp':     return { icon: '⭐', label: `+${reward.value} XP` };
      case 'card':   return { icon: '🃏', label: `${reward.cardId?.split('.').pop()} ×${reward.count}` };
      case 'perk':   return { icon: '🌟', label: `${reward.perkId?.split('.').pop()} ×${reward.count}` };
    }
  })();
  return (
    <span
      className="px-2 py-0.5 rounded-md flex items-center gap-1"
      style={{
        background: 'rgba(255,213,79,0.18)',
        border: '1.5px solid rgba(255,213,79,0.45)',
        color: '#ffd54f',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function OrderResultRow({ order }: { order: OrderSummary }) {
  const pct = Math.min(100, Math.round((order.progress / Math.max(1, order.goal)) * 100));
  const accent = order.fulfilled ? '#a5d6a7' : '#bcaaa4';
  return (
    <div
      className="rounded-lg p-2 flex items-center gap-2"
      style={{
        background: order.fulfilled ? 'rgba(46,125,50,0.32)' : 'rgba(255,255,255,0.07)',
        border: `1.5px solid ${order.fulfilled ? 'rgba(165,214,167,0.55)' : 'rgba(255,255,255,0.12)'}`,
      }}
    >
      <div
        className="text-2xl flex-shrink-0"
        style={{ filter: order.fulfilled ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' : 'grayscale(70%)', opacity: order.fulfilled ? 1 : 0.7 }}
      >
        {order.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-[12px] font-extrabold truncate">{order.title}</div>
          <div
            className="text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full"
            style={{ background: accent, color: '#1b3a1f' }}
          >
            {order.fulfilled ? '✓ Done' : 'Unfinished'}
          </div>
        </div>
        <div className="text-[10px] opacity-85 leading-tight mt-0.5">{order.description}</div>
        {!order.fulfilled && (
          <div className="h-1 bg-black/35 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #ffd54f 0%, #f9a825 100%)' }}
            />
          </div>
        )}
      </div>
      <div className="text-[11px] font-extrabold flex-shrink-0 ml-1"
           style={{ color: order.fulfilled ? '#fff176' : 'rgba(255,255,255,0.45)' }}>
        {order.fulfilled ? `+${order.reward}c` : `${order.progress}/${order.goal}`}
      </div>
    </div>
  );
}
