import type { Card, Perk, Rarity } from '@engine/index';

// Shared full-detail modal for shop tiles. Opened by tapping the small "i"
// badge on any card or perk in the shop grid. Renders all the data the
// compact tile can't show: full description, effect text, seed/tool stats,
// pricing, and a clear "this is consumable / persistent" line for perks.

const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7', uncommon: '#90caf9', rare: '#ce93d8',
  epic: '#ffab76', legendary: '#ffd54f', mythic: '#ff8a65',
};

interface CardDetailProps {
  kind: 'card';
  card: Card;
  coinPrice: number;
  gemPrice: number;
  bought: boolean;
  onClose: () => void;
}

interface PerkDetailProps {
  kind: 'perk';
  perk: Perk;
  coinPrice: number | null;
  gemPrice: number;
  bought: boolean;
  onClose: () => void;
}

type Props = CardDetailProps | PerkDetailProps;

export default function ShopItemDetailModal(props: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={props.onClose}
    >
      <div
        className="pb-panel-dark p-4 w-full max-w-sm max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {props.kind === 'card' ? (
          <CardBody {...props} />
        ) : (
          <PerkBody {...props} />
        )}

        <div className="flex justify-end mt-4">
          <button onClick={props.onClose} className="pb-btn pb-btn-cream pb-btn-md">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function CardBody({ card, coinPrice, gemPrice, bought }: CardDetailProps) {
  const accent = rarityColor[card.rarity];
  const isSeed = card.type === 'seed';
  return (
    <>
      {/* Hero: emoji + name + rarity */}
      <div className="text-center mb-3">
        <div className="text-6xl mb-1" style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))' }}>
          {card.emoji}
        </div>
        <h2 className="pb-title text-2xl">{card.name}</h2>
        <div className="flex justify-center gap-2 mt-1.5 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: accent, color: '#1b3a1f' }}
          >
            {card.rarity}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            {isSeed ? '🌱 Seed' : '🔧 Tool'}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            Grade F
          </span>
        </div>
      </div>

      {/* Stat block */}
      <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {isSeed ? (
          <>
            <DetailRow label="Crop" value={`${card.crop}`} />
            <DetailRow label="Grow time" value={`${card.growRounds} round${card.growRounds === 1 ? '' : 's'}`} />
            <DetailRow label="Base sell price" value={`🌾 ${card.sellPrice}c`} />
            {card.effect && <DetailRow label="Effect" value={card.effect} />}
          </>
        ) : (
          <>
            <DetailRow label="Type" value={card.persistent ? '🔁 Persistent' : '⚡ Instant'} />
            <DetailRow label="Effect" value={card.effect} />
          </>
        )}
      </div>

      {/* Price + bought-state hint */}
      <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,213,79,0.15)', border: '1.5px solid rgba(255,213,79,0.45)' }}>
        <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-85 mb-1">
          Price
        </div>
        <div className="flex items-center gap-3 text-sm font-extrabold">
          <span>💰 {coinPrice}</span>
          <span className="opacity-50">·</span>
          <span>💎 {gemPrice}</span>
        </div>
        {bought && (
          <div className="text-[11px] font-extrabold mt-2" style={{ color: '#a5d6a7' }}>
            ✓ Already bought today
          </div>
        )}
      </div>

      <p className="text-[11px] opacity-70 mt-3">
        Cards from the daily shop arrive at <strong>F grade</strong>. Upgrade them in the Deck Management screen by combining duplicates.
      </p>
    </>
  );
}

function PerkBody({ perk, coinPrice, gemPrice, bought }: PerkDetailProps) {
  const accent = rarityColor[perk.rarity];
  return (
    <>
      <div className="text-center mb-3">
        <div className="text-6xl mb-1" style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,0.4))' }}>
          {perk.icon}
        </div>
        <h2 className="pb-title text-2xl">{perk.name}</h2>
        <div className="flex justify-center gap-2 mt-1.5 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: accent, color: '#1b3a1f' }}
          >
            {perk.rarity}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            {perk.kind}
          </span>
          <span
            className="text-[10px] uppercase tracking-widest font-extrabold px-2 py-0.5 rounded-full"
            style={{ background: '#1565c0', color: '#fff' }}
          >
            🔥 Consumable ×1
          </span>
        </div>
      </div>

      <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-80 mb-1">
          Effect
        </div>
        <p className="text-[13px] leading-relaxed">{perk.description}</p>
      </div>

      <div className="rounded-lg p-2.5" style={{ background: 'rgba(255,213,79,0.15)', border: '1.5px solid rgba(255,213,79,0.45)' }}>
        <div className="text-[10px] uppercase tracking-widest font-extrabold opacity-85 mb-1">
          Price
        </div>
        <div className="flex items-center gap-3 text-sm font-extrabold">
          <span>{coinPrice !== null ? `💰 ${coinPrice}` : '💰 — (crystals only)'}</span>
          <span className="opacity-50">·</span>
          <span>💎 {gemPrice}</span>
        </div>
        {bought && (
          <div className="text-[11px] font-extrabold mt-2" style={{ color: '#a5d6a7' }}>
            ✓ Already bought today
          </div>
        )}
      </div>

      <p className="text-[11px] opacity-70 mt-3">
        Each purchase grants <strong>one charge</strong>. Equip the perk before a run to consume it; starter perks (Early Bird, Extra Draw) are never consumed.
      </p>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-[10px] uppercase tracking-widest opacity-65 font-extrabold flex-shrink-0">
        {label}
      </span>
      <span className="text-[12px] font-extrabold text-right">
        {value}
      </span>
    </div>
  );
}
