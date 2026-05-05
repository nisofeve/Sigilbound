// Card pack opening modal — reveals cards one-by-one with a flip animation,
// then shows a summary of all obtained cards before letting the player collect.

import { useState, useEffect } from 'react';
import { getAction, getTactic, type ActionCardDef, type TacticCardDef } from '@engine/index';
import { CombatCard } from '@ui/components/CombatCard';

type CombatCardDef = ActionCardDef | TacticCardDef;

const RARITY_COLOR: Record<string, string> = {
  common:    '#a5d6a7',
  uncommon:  '#90caf9',
  rare:      '#ce93d8',
  epic:      '#ffab76',
  legendary: '#ffd54f',
  mythic:    '#ff8a65',
};

const RARITY_GLOW: Record<string, string> = {
  common:    'rgba(165,214,167,0.4)',
  uncommon:  'rgba(144,202,249,0.4)',
  rare:      'rgba(206,147,216,0.5)',
  epic:      'rgba(255,171,118,0.55)',
  legendary: 'rgba(255,213,79,0.65)',
  mythic:    'rgba(255,138,101,0.7)',
};

interface Props {
  cardIds: string[];   // ordered list of card IDs to reveal
  onClose: () => void;
}

export default function CardPackOpenModal({ cardIds, onClose }: Props) {
  const cards = cardIds.map(id => getAction(id) ?? getTactic(id)).filter((c): c is CombatCardDef => !!c);

  const [phase, setPhase] = useState<'reveal' | 'summary'>('reveal');
  const [revealedIdx, setRevealedIdx] = useState<number>(-1); // -1 = none shown yet
  const [flipped, setFlipped] = useState<boolean[]>(cards.map(() => false));

  // Auto-advance to first card reveal after mount
  useEffect(() => {
    const t = setTimeout(() => setRevealedIdx(0), 400);
    return () => clearTimeout(t);
  }, []);

  // Flip the current card face-up after it appears
  useEffect(() => {
    if (revealedIdx < 0) return;
    const t = setTimeout(() => {
      setFlipped(prev => {
        const next = [...prev];
        next[revealedIdx] = true;
        return next;
      });
    }, 300);
    return () => clearTimeout(t);
  }, [revealedIdx]);

  function handleTap() {
    if (phase === 'summary') { onClose(); return; }
    // If current card not flipped yet, flip it immediately
    if (!flipped[revealedIdx]) {
      setFlipped(prev => { const n = [...prev]; n[revealedIdx] = true; return n; });
      return;
    }
    // Advance to next card or go to summary
    if (revealedIdx < cards.length - 1) {
      setRevealedIdx(i => i + 1);
    } else {
      setPhase('summary');
    }
  }

  const currentCard = revealedIdx >= 0 ? cards[revealedIdx] : null;
  const rarityColor = currentCard ? (RARITY_COLOR[currentCard.rarity] ?? '#e2e8f0') : '#e2e8f0';
  const rarityGlow  = currentCard ? (RARITY_GLOW[currentCard.rarity]  ?? 'transparent') : 'transparent';

  if (phase === 'summary') {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center safe-top safe-bottom"
        style={{ background: 'rgba(5,4,10,0.97)', backdropFilter: 'blur(8px)' }}
        onClick={onClose}
      >
        <div
          className="pb-pop-in flex flex-col items-center w-full max-w-sm px-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="text-center mb-5">
            <div className="text-4xl mb-1">🃏</div>
            <h2 className="fredoka text-2xl" style={{ color: '#ffd54f' }}>Cards Obtained!</h2>
            <p className="text-xs opacity-60 mt-1" style={{ color: '#e2e8f0' }}>Added to your collection</p>
          </div>

          {/* Card summary grid */}
          <div
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1.5px solid rgba(255,235,180,0.12)',
              borderRadius: 14,
              padding: '16px 12px',
              marginBottom: 20,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
              {cards.map((card, i) => (
                <div
                  key={i}
                  className="pb-fade-up flex flex-col items-center gap-1"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <CombatCard card={card} size="sm" />
                  <div style={{
                    fontSize: '0.55rem', fontFamily: "'Nunito', sans-serif", fontWeight: 800,
                    letterSpacing: '0.1em', color: RARITY_COLOR[card.rarity] ?? '#e2e8f0',
                    textTransform: 'uppercase',
                  }}>
                    {card.rarity}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onClose}
            className="pb-btn pb-btn-gold pb-btn-md w-full pb-pulse"
          >
            ✓ Collect
          </button>
        </div>
      </div>
    );
  }

  // Reveal phase
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center safe-top safe-bottom"
      style={{ background: 'rgba(5,4,10,0.97)', backdropFilter: 'blur(8px)', cursor: 'pointer' }}
      onClick={handleTap}
    >
      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28, justifyContent: 'center' }}>
        {cards.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === revealedIdx ? 20 : 6,
              height: 6,
              borderRadius: 99,
              background: i < revealedIdx
                ? 'rgba(255,235,180,0.6)'
                : i === revealedIdx
                  ? '#ffd54f'
                  : 'rgba(255,255,255,0.12)',
              transition: 'all 200ms ease',
            }}
          />
        ))}
      </div>

      {/* Card flip stage */}
      <div
        style={{ position: 'relative', width: 160, height: 224, marginBottom: 28 }}
        onClick={e => { e.stopPropagation(); handleTap(); }}
      >
        {revealedIdx >= 0 && (
          <div
            style={{
              width: '100%', height: '100%',
              transition: 'transform 500ms cubic-bezier(0.2,0.8,0.2,1)',
              transformStyle: 'preserve-3d',
              transform: flipped[revealedIdx] ? 'rotateY(0deg)' : 'rotateY(180deg)',
            }}
          >
            {/* Card face */}
            <div
              className="pb-pop-in"
              style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden',
                borderRadius: 14,
                boxShadow: flipped[revealedIdx]
                  ? `0 0 40px ${rarityGlow}, 0 0 80px ${rarityGlow}, 0 16px 40px rgba(0,0,0,0.7)`
                  : 'none',
                transition: 'box-shadow 400ms ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {currentCard && (
                <CombatCard card={currentCard} size="md" />
              )}
            </div>

            {/* Card back */}
            <div
              style={{
                position: 'absolute', inset: 0,
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                borderRadius: 14,
                background: 'linear-gradient(135deg, #1a0f2a 0%, #0a0614 60%, #14091a 100%)',
                border: '2px solid rgba(200,160,255,0.3)',
                boxShadow: '0 0 20px rgba(160,100,240,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 48, opacity: 0.4 }}>🃏</span>
            </div>
          </div>
        )}

        {/* Rarity glow ring — appears after flip */}
        {currentCard && flipped[revealedIdx] && (
          <div
            style={{
              position: 'absolute', inset: -8, borderRadius: 22,
              border: `2px solid ${rarityColor}`,
              boxShadow: `0 0 20px ${rarityGlow}`,
              pointerEvents: 'none',
              animation: 'pb-pop-in 300ms ease-out both',
            }}
          />
        )}
      </div>

      {/* Card name + rarity — show after flip */}
      <div style={{ textAlign: 'center', minHeight: 48 }}>
        {currentCard && flipped[revealedIdx] && (
          <div className="pb-fade-up">
            <div style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: '1.3rem',
              color: '#f1f5f9',
              lineHeight: 1.1,
              marginBottom: 4,
            }}>
              {currentCard.name}
            </div>
            <div style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.65rem', fontWeight: 800,
              letterSpacing: '0.2em',
              color: rarityColor,
              textTransform: 'uppercase',
            }}>
              {currentCard.rarity}
            </div>
          </div>
        )}
      </div>

      {/* Tap hint */}
      <div style={{
        position: 'absolute', bottom: 32,
        fontFamily: "'Nunito', sans-serif",
        fontSize: '0.65rem', fontWeight: 700,
        letterSpacing: '0.15em',
        color: 'rgba(255,255,255,0.25)',
        textTransform: 'uppercase',
      }}>
        {!flipped[revealedIdx]
          ? 'Tap to reveal'
          : revealedIdx < cards.length - 1
            ? `Tap for next · ${revealedIdx + 1} / ${cards.length}`
            : 'Tap to continue'}
      </div>
    </div>
  );
}
