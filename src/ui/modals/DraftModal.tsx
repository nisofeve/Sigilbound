import { getCard, type CardId, type SeedCard, type ToolCard } from '@engine/index';

interface Props {
  cards: CardId[];
  onPick: (cardId: CardId) => void;
  onSkip: () => void;
}

const rarityColor: Record<string, string> = {
  common: '#a5d6a7', uncommon: '#90caf9', rare: '#ce93d8',
  epic: '#ffab76', legendary: '#ffd54f', mythic: '#ff80ab',
};

export default function DraftModal({ cards, onPick, onSkip }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 backdrop-blur-sm overflow-y-auto p-3 safe-top safe-bottom">
      <div className="pb-panel max-w-2xl w-full p-4 sm:p-6 my-auto pb-pop-in" style={{ color: '#3e2723' }}>
        <div className="text-center mb-4 sm:mb-5">
          <div className="text-3xl sm:text-4xl mb-1 inline-block pb-bob" style={{ animationDuration: '2.6s' }}>🃏</div>
          <h2 className="fredoka text-2xl sm:text-3xl" style={{ color: '#1b3a1f', textShadow: '0 2px 0 rgba(255,255,255,0.4)' }}>
            Draft Pick
          </h2>
          <div className="text-[11px] sm:text-xs font-bold mt-1 opacity-80">
            Choose 1 card to add to your deck — or skip
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4 sm:mb-5">
          {cards.map((id, i) => {
            const card = getCard(id);
            const accent = rarityColor[card.rarity] ?? '#fff';
            return (
              <button
                key={id}
                onClick={() => onPick(id)}
                className="relative rounded-xl p-2 sm:p-3 active:scale-95 sm:hover:scale-105 sm:active:scale-100 transition-transform pb-pop-in overflow-hidden"
                style={{
                  background: 'linear-gradient(180deg, #fff 0%, #f5e8c8 100%)',
                  border: `3px solid ${accent}`,
                  color: '#3e2723',
                  boxShadow: `0 0 0 0 ${accent}, 0 4px 0 rgba(0,0,0,0.18), 0 6px 14px rgba(0,0,0,0.3)`,
                  animationDelay: `${i * 0.07}s`,
                }}
              >
                <DraftCard card={card} accent={accent} />
              </button>
            );
          })}
        </div>

        <div className="flex justify-center">
          <button onClick={onSkip} className="pb-btn pb-btn-cream pb-btn-sm">
            Skip Draft
          </button>
        </div>
      </div>
    </div>
  );
}

function DraftCard({ card, accent }: { card: SeedCard | ToolCard; accent: string }) {
  const banner = card.type === 'seed' ? '#3a7d44' : '#1565c0';
  return (
    <div className="text-center">
      <div
        className="text-white text-[9px] sm:text-[10px] font-extrabold tracking-wider rounded-md py-1 -mx-2 -mt-2 mb-1"
        style={{
          background: banner,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.2)',
        }}
      >
        {card.type === 'seed' ? '🌱 SEED' : '🔧 TOOL'}
      </div>
      <div
        className="text-4xl sm:text-5xl my-1 sm:my-2"
        style={{ filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))' }}
      >
        {card.emoji}
      </div>
      <div className="fredoka text-[11px] sm:text-sm leading-tight">{card.name}</div>
      {card.type === 'seed' ? (
        <div className="text-[10px] sm:text-[11px] mt-1 flex justify-around font-extrabold">
          <span style={{ color: '#e65100' }}>⏱{card.growRounds}</span>
          <span style={{ color: '#2e7d32' }}>🌾{card.sellPrice}</span>
        </div>
      ) : (
        <div className="text-[9px] sm:text-[10px] mt-1 px-1 leading-tight line-clamp-2 opacity-85">{card.effect}</div>
      )}
      <div
        className="text-[8px] sm:text-[9px] uppercase tracking-widest mt-1 font-extrabold px-2 py-0.5 rounded-full inline-block"
        style={{ background: accent, color: '#1b3a1f' }}
      >
        {card.rarity}
      </div>
    </div>
  );
}
