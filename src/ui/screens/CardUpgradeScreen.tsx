import { useState } from 'react';
import { getAction, getTactic } from '@engine/index';
import type { Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onClose: () => void;
}

export default function CardUpgradeScreen({ profile, onClose }: Props) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const cardTierCap = profile.cardTierCap ?? 3;
  const nextCapThreshold = profile.bossesDefeated + 1;

  const cards = Object.entries(profile.combatCardInventory ?? {}).map(([id]) => {
    const actionCard = getAction(id);
    const tier = profile.combatCardTiers?.[id] ?? 1;
    return {
      id,
      tier,
      type: actionCard ? 'action' : 'tactic',
    };
  });

  const handleCardClick = (id: string) => {
    setSelectedCard(selectedCard === id ? null : id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-3" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg"
        style={{ background: 'linear-gradient(135deg, #2a3a2a 0%, #1a2a1a 100%)', padding: 24 }}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="pb-title text-2xl mb-1">⚙️ Card Upgrades</h1>
          <p className="text-[12px] opacity-70">
            Tier Cap: <strong>{cardTierCap}</strong> / 10
          </p>
        </div>

        {/* Tier Cap Info */}
        {cardTierCap < 10 && (
          <div
            className="rounded-lg p-3 mb-4"
            style={{
              background: 'rgba(255,213,79,0.1)',
              border: '1px solid rgba(255,213,79,0.3)',
            }}
          >
            <div className="text-[11px] opacity-80">
              🏆 Defeat boss at stage {nextCapThreshold * 10} to increase tier cap to {cardTierCap + 1}
            </div>
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {cards.map(({ id, tier, type }) => {
            const card = type === 'action' ? getAction(id) : getTactic(id);
            if (!card) return null;

            const canUpgrade = tier < cardTierCap;
            const isMaxed = tier >= 10;

            return (
              <div
                key={id}
                onClick={() => handleCardClick(id)}
                className="p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  background: selectedCard === id
                    ? 'linear-gradient(135deg, rgba(100,200,255,0.2) 0%, rgba(50,150,255,0.1) 100%)'
                    : 'rgba(255,255,255,0.06)',
                  border: selectedCard === id
                    ? '1.5px solid rgba(100,200,255,0.4)'
                    : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="text-2xl flex-shrink-0">{(card as any).emoji || '🃏'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-extrabold truncate">{card.name}</div>
                    <div className="text-[10px] opacity-60">Tier {tier}</div>
                  </div>
                </div>

                {/* Upgrade Info */}
                {selectedCard === id && (
                  <div className="text-[10px] mt-2 space-y-1">
                    {canUpgrade && !isMaxed && (
                      <div className="text-amber-300 opacity-80">↗ Can upgrade to tier {tier + 1}</div>
                    )}
                    {tier >= cardTierCap && cardTierCap < 10 && (
                      <div className="opacity-60">Tier capped — defeat more bosses to unlock</div>
                    )}
                    {isMaxed && (
                      <div className="opacity-60">Maximum tier reached</div>
                    )}
                  </div>
                )}
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
