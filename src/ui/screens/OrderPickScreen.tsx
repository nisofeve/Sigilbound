import { useMemo, useState } from 'react';
import { rollOrderOffer, type OrderCard } from '@engine/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';

interface Props {
  // Run seed — derives the deterministic 5-card offer so re-entering this
  // screen doesn't reroll. App.tsx already picks a seed before this screen
  // mounts (cloud or local random), and that same seed is reused for the run.
  runSeed: number;
  // Player commits with their 3 chosen orders. Caller owns the routing
  // (typically: store + setScreen('game')).
  onConfirm: (chosenOrders: OrderCard[]) => void;
  onBack: () => void;
}

const REQUIRED = 3;
const OFFER_SIZE = 5;

const DIFFICULTY_STYLE: Record<1 | 2 | 3, { label: string; color: string; pillBg: string }> = {
  1: { label: 'EASY',   color: '#1b5e20', pillBg: '#a5d6a7' },
  2: { label: 'MED',    color: '#1b3a1f', pillBg: '#ffd54f' },
  3: { label: 'HARD',   color: '#3e2723', pillBg: '#ff80ab' },
};

export default function OrderPickScreen({ runSeed, onConfirm, onBack }: Props) {
  // Memoised so re-renders (selection toggling) don't reroll the offer. The
  // seed is the only thing that matters — same run = same offer.
  const offer = useMemo(() => rollOrderOffer(runSeed, OFFER_SIZE), [runSeed]);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const isReady = selectedIds.length === REQUIRED;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(x => x !== id));
      return;
    }
    if (selectedIds.length >= REQUIRED) return; // hard cap
    setSelectedIds([...selectedIds, id]);
  }

  function commit() {
    if (!isReady) return;
    const chosen = offer.filter(o => selectedIds.includes(o.id));
    // Re-stamp ids with order.0/1/2 so they match the in-run convention
    // (the runner & order panel index orders by position, not by id).
    const stamped: OrderCard[] = chosen.map((card, i) => ({ ...card, id: `order.${i}` }));
    onConfirm(stamped);
  }

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={6} fallingEmojis={['📜', '🌾', '✨']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Perks</button>
            <div className="pb-panel-dark px-3 py-1.5 text-sm">
              <span className="text-[10px] uppercase tracking-widest opacity-75 font-extrabold mr-1">Pick</span>
              <span className="font-extrabold text-yellow-200">{selectedIds.length} / {REQUIRED}</span>
            </div>
          </div>

          <div className="text-center mb-5 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">📜 Choose Your Orders</h1>
            <p className="text-[11px] sm:text-sm font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Pick {REQUIRED} of these {OFFER_SIZE} clients to fulfil this season. The rest go home empty-handed.
            </p>
          </div>

          {/* Offer grid — full-detail order cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
            {offer.map((card, i) => (
              <OrderOfferCard
                key={card.id}
                card={card}
                index={i}
                selected={selectedIds.includes(card.id)}
                disabled={!selectedIds.includes(card.id) && selectedIds.length >= REQUIRED}
                onToggle={() => toggle(card.id)}
              />
            ))}
          </div>

          {/* Sticky confirm bar */}
          <div className="sticky bottom-3 z-20 flex justify-center">
            <button
              onClick={commit}
              disabled={!isReady}
              className={`pb-btn ${isReady ? 'pb-btn-gold pb-pulse' : 'pb-btn-cream'} pb-btn-lg`}
            >
              {isReady ? `▶ Start Battle with ${REQUIRED} Objectives` : `Pick ${REQUIRED - selectedIds.length} more`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderOfferCard({
  card, index, selected, disabled, onToggle,
}: {
  card: OrderCard;
  index: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const diff = DIFFICULTY_STYLE[card.difficulty];

  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`pb-fade-up text-left rounded-2xl overflow-hidden relative transition-all ${
        disabled ? 'cursor-not-allowed opacity-60' : 'active:scale-[0.98] hover:-translate-y-0.5'
      } ${selected ? 'pb-pop-in' : ''}`}
      style={{
        background: selected
          ? 'linear-gradient(180deg, #fff8e1 0%, #ffe082 100%)'
          : 'linear-gradient(180deg, #fffaf2 0%, #f5e8c8 100%)',
        border: `4px solid ${selected ? '#ffd54f' : diff.pillBg}`,
        color: '#3e2723',
        boxShadow: selected
          ? '0 0 0 3px rgba(255,213,79,0.55), 0 6px 0 rgba(0,0,0,0.18), 0 10px 22px rgba(0,0,0,0.28)'
          : '0 4px 0 rgba(0,0,0,0.15), 0 8px 18px rgba(0,0,0,0.22)',
        animationDelay: `${0.04 * index}s`,
      }}
    >
      {/* Selected stamp */}
      {selected && (
        <div
          className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center font-extrabold pb-pop-in"
          style={{
            background: 'linear-gradient(180deg, #66bb6a 0%, #2e7d32 100%)',
            color: '#fff',
            border: '3px solid #fff',
            boxShadow: '0 3px 0 rgba(0,0,0,0.25)',
            fontSize: 18,
          }}
          aria-label="Selected"
        >
          ✓
        </div>
      )}

      {/* Difficulty + reward banner */}
      <div
        className="px-3 py-1.5 text-center font-extrabold flex items-center justify-center gap-2"
        style={{ background: diff.pillBg, color: diff.color }}
      >
        <span className="text-[11px] uppercase tracking-widest">{diff.label}</span>
        <span className="opacity-50">·</span>
        <span className="text-sm">+{card.reward}c reward</span>
      </div>

      <div className="p-3 sm:p-4">
        {/* Icon + title */}
        <div className="flex items-center gap-3 mb-2.5">
          <div
            className="flex-shrink-0"
            style={{
              fontSize: 44,
              lineHeight: 1,
              filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))',
            }}
          >
            {card.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="fredoka text-base sm:text-lg leading-tight">{card.title}</div>
            <div className="fredoka text-[12px] mt-1" style={{ color: '#1b5e20' }}>
              {card.description}
            </div>
          </div>
        </div>

        {/* Flavor + remark */}
        <div className="text-[12px] leading-snug mb-1.5" style={{ color: '#5d4037' }}>
          {card.flavor}
        </div>
        <div className="text-[11px] italic leading-snug" style={{ color: '#8d6e63' }}>
          {card.remark}
        </div>
      </div>
    </button>
  );
}
