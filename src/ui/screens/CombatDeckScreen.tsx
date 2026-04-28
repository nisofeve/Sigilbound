// Sigilbound combat deck builder — heraldic, mobile-portrait FTP layout.
// Top bar / scrollable card list with +/- buttons / sticky bottom info bar.

import { useMemo, useState } from 'react';
import {
  allActions,
  allTactics,
  type ActionCardDef,
  type TacticCardDef,
} from '@engine/index';
import { damageTypeColorHex } from '@game/theme';
import {
  addToCombatDeck,
  combatDeckLimits,
  removeFromCombatDeck,
  type Profile,
} from '@storage/index';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

type FilterTab = 'all' | 'action' | 'tactic';

export default function CombatDeckScreen({ profile, onProfileChange, onBack }: Props) {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [msg, setMsg] = useState<string | null>(null);

  const limits = useMemo(() => combatDeckLimits(), []);
  const ownedActions = useMemo(() => allActions().filter(a => (profile.combatCardInventory[a.id] ?? 0) > 0), [profile.combatCardInventory]);
  const ownedTactics = useMemo(() => allTactics().filter(t => (profile.combatCardInventory[t.id] ?? 0) > 0), [profile.combatCardInventory]);

  // Group deck by card id with counts for the deck list.
  const deckGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of profile.combatDeck) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [profile.combatDeck]);

  const visibleCards: ReadonlyArray<ActionCardDef | TacticCardDef> = useMemo(() => {
    if (filter === 'action') return ownedActions;
    if (filter === 'tactic') return ownedTactics;
    return [...ownedActions, ...ownedTactics];
  }, [filter, ownedActions, ownedTactics]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1400);
  }

  function add(cardId: string) {
    const next = addToCombatDeck(profile, cardId);
    if (!next) {
      const owned = profile.combatCardInventory[cardId] ?? 0;
      const inDeck = profile.combatDeck.filter(id => id === cardId).length;
      if (profile.combatDeck.length >= limits.max) flash(`Deck is full (${limits.max})`);
      else if (inDeck >= owned) flash('No more copies owned');
      return;
    }
    onProfileChange(next);
  }

  function remove(cardId: string) {
    const next = removeFromCombatDeck(profile, cardId);
    if (!next) {
      flash(`Deck minimum is ${limits.min}`);
      return;
    }
    onProfileChange(next);
  }

  const deckCount = profile.combatDeck.length;
  const deckOk = deckCount >= limits.min && deckCount <= limits.max;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom">

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
          ← HOME
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          🃏 CARD VAULT
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Filter tabs */}
      <div className="relative z-10 px-3 pb-2 flex gap-1.5">
        <FilterTab active={filter === 'all'}    onClick={() => setFilter('all')}    label={`ALL ${ownedActions.length + ownedTactics.length}`} />
        <FilterTab active={filter === 'action'} onClick={() => setFilter('action')} label={`⚔ ACTIONS ${ownedActions.length}`} />
        <FilterTab active={filter === 'tactic'} onClick={() => setFilter('tactic')} label={`🧪 TACTICS ${ownedTactics.length}`} />
      </div>

      {/* Card list — scrollable */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-3 sb-fade-up">
        {visibleCards.length === 0 ? (
          <div className="text-center py-12 opacity-60">
            <div className="text-5xl mb-3">📦</div>
            <div className="sb-display text-sm" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}>
              NO CARDS HERE
            </div>
            <div className="text-[11px] opacity-75 mt-1" style={{ color: 'var(--sb-parchment)' }}>
              Visit the Bazaar to buy more cards.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {visibleCards.map(card => {
              const owned = profile.combatCardInventory[card.id] ?? 0;
              const inDeck = deckGroups.get(card.id) ?? 0;
              const remaining = owned - inDeck;
              const isAction = 'damageType' in card;
              return (
                <div
                  key={card.id}
                  className={`sb-rarity-${card.rarity} flex items-center gap-2 px-2.5 py-2`}
                  style={{
                    background: 'linear-gradient(180deg, var(--sb-parchment) 0%, var(--sb-parchment-dark) 100%)',
                    border: '2px solid var(--sb-parchment-edge)',
                    borderRadius: '4px',
                    color: '#2c1810',
                    boxShadow: 'inset 0 0 0 1px rgba(255,235,180,0.35), var(--sb-shadow-sm)',
                  }}
                >
                  <span className="text-2xl flex-shrink-0">{card.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="sb-display font-bold text-[13px] flex items-center gap-1.5">
                      <span className="truncate">{card.name}</span>
                      {isAction && (
                        <span
                          className="sb-mono text-[9px] px-1.5 rounded font-bold"
                          style={{
                            background: 'rgba(0,0,0,0.4)',
                            color: damageTypeColorHex((card as ActionCardDef).damageType),
                            letterSpacing: '0.1em',
                          }}
                        >
                          {(card as ActionCardDef).damageType.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] opacity-80 leading-snug line-clamp-2">
                      {isAction
                        ? `⚔ ${(card as ActionCardDef).damage} · ⏱ ${(card as ActionCardDef).charge} · ⚡ ${(card as ActionCardDef).cost}`
                        : `⚡ ${(card as TacticCardDef).cost} · ${(card as TacticCardDef).description}`}
                      {isAction && (card as ActionCardDef).effect && <> · {(card as ActionCardDef).effect}</>}
                    </div>
                    <div className="sb-mono text-[10px] mt-0.5 opacity-65">
                      OWNED {owned} · IN DECK {inDeck}{remaining > 0 ? ` · ${remaining} FREE` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => remove(card.id)}
                      disabled={inDeck === 0}
                      className="sb-btn sb-btn-steel"
                      style={{ fontSize: '14px', padding: '6px 10px', minWidth: 36 }}
                      aria-label="Remove from deck"
                    >
                      −
                    </button>
                    <button
                      onClick={() => add(card.id)}
                      disabled={remaining <= 0}
                      className="sb-btn sb-btn-gold"
                      style={{ fontSize: '14px', padding: '6px 10px', minWidth: 36 }}
                      aria-label="Add to deck"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Sticky bottom: deck count summary + flash msg */}
      <div
        className="relative z-20 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        {msg && (
          <div
            className="sb-display text-center mb-2 px-3 py-1.5"
            style={{
              fontSize: '11px',
              letterSpacing: '0.18em',
              background: 'rgba(220,38,38,0.25)',
              border: '1px solid var(--sb-crimson-light)',
              borderRadius: '3px',
              color: '#fecaca',
            }}
          >
            ⚠ {msg.toUpperCase()}
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="sb-display text-[10px] opacity-65" style={{ letterSpacing: '0.2em', color: 'var(--sb-gold-light)' }}>
              YOUR COMBAT DECK
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="sb-mono font-bold text-2xl"
                style={{ color: deckOk ? 'var(--sb-gold)' : 'var(--sb-crimson-light)' }}
              >
                {deckCount}
              </span>
              <span className="sb-mono text-[10px] opacity-65" style={{ color: 'var(--sb-gold-light)' }}>
                / {limits.min}–{limits.max}
              </span>
            </div>
          </div>
          {!deckOk && deckCount < limits.min && (
            <div className="sb-mono text-[10px] flex-shrink-0" style={{ color: '#fecaca' }}>
              ADD {limits.min - deckCount} MORE
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="sb-display flex-1 px-2 py-1.5 transition-all"
      style={{
        background: active
          ? 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)'
          : 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: active ? '2px solid var(--sb-gold-light)' : '1.5px solid var(--sb-bronze-dark)',
        borderRadius: '3px',
        color: active ? 'var(--sb-shadow)' : 'var(--sb-gold-light)',
        cursor: 'pointer',
        fontSize: '10px',
        letterSpacing: '0.18em',
        fontWeight: 700,
        boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.4)' : 'inset 0 1px 0 rgba(255,200,140,0.15)',
      }}
    >
      {label}
    </button>
  );
}
