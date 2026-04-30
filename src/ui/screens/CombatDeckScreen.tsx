// Sigilbound combat deck builder — Plotbound-style grid management.
// Two tabs: Edit Deck (portrait card grid + inventory) · Upgrade Cards.
// Rarity borders, long-press/hover preview popover, double-tap to unequip.

import { useEffect, useRef, useState, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  allActions,
  allTactics,
  type ActionCardDef,
  type TacticCardDef,
} from '@engine/index';
import {
  addToCombatDeck,
  combatDeckLimits,
  removeFromCombatDeck,
  type Profile,
} from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';
import { RARITY_COLOR, DAMAGE_TYPE_COLOR } from '@ui/components/GameCard';

type CombatCard = ActionCardDef | TacticCardDef;
type Tab = 'edit' | 'upgrade';
type Filter = 'all' | 'action' | 'tactic';

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

function isAction(card: CombatCard): card is ActionCardDef {
  return card.type === 'action';
}

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

interface PreviewTarget {
  card: CombatCard;
  anchorRect: { top: number; left: number; width: number; height: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────

export default function CombatDeckScreen({ profile, onProfileChange, onBack }: Props) {
  const [tab, setTab]         = useState<Tab>('edit');
  const [filter, setFilter]   = useState<Filter>('all');
  const [msg, setMsg]         = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const limits = useMemo(() => combatDeckLimits(), []);
  const deckCount = profile.combatDeck.length;
  const deckOk    = deckCount >= limits.min && deckCount <= limits.max;

  const allActionCards = useMemo(() => allActions(), []);
  const allTacticCards = useMemo(() => allTactics(), []);

  // Flat card lookup map — avoids repeated array scans in render.
  const cardMap = useMemo(() => {
    const m = new Map<string, CombatCard>();
    for (const c of allActionCards) m.set(c.id, c);
    for (const c of allTacticCards) m.set(c.id, c);
    return m;
  }, [allActionCards, allTacticCards]);

  const ownedActions = useMemo(
    () => allActionCards.filter(a => (profile.combatCardInventory[a.id] ?? 0) > 0),
    [allActionCards, profile.combatCardInventory],
  );
  const ownedTactics = useMemo(
    () => allTacticCards.filter(t => (profile.combatCardInventory[t.id] ?? 0) > 0),
    [allTacticCards, profile.combatCardInventory],
  );

  // How many copies of each card are in the deck.
  const deckCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of profile.combatDeck) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [profile.combatDeck]);

  // Inventory view — all owned cards with availability, filtered by type tab.
  const inventoryItems = useMemo(() => {
    const source =
      filter === 'action' ? ownedActions :
      filter === 'tactic' ? ownedTactics :
      [...ownedActions, ...ownedTactics];
    return source.map(card => {
      const owned  = profile.combatCardInventory[card.id] ?? 0;
      const inDeck = deckCounts.get(card.id) ?? 0;
      return { card, owned, inDeck, available: Math.max(0, owned - inDeck) };
    });
  }, [filter, ownedActions, ownedTactics, profile.combatCardInventory, deckCounts]);

  function showMsg(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 1800);
  }

  function equip(cardId: string) {
    const next = addToCombatDeck(profile, cardId);
    if (!next) {
      if (deckCount >= limits.max) showMsg('err', `Deck full (${limits.max} max)`);
      else showMsg('err', 'No more copies owned');
      return;
    }
    onProfileChange(next);
  }

  function unequip(cardId: string) {
    const next = removeFromCombatDeck(profile, cardId);
    if (!next) { showMsg('err', `Deck minimum is ${limits.min}`); return; }
    onProfileChange(next);
  }

  return (
    <div
      className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom"
      style={{ background: 'linear-gradient(160deg, #1a0f07 0%, #0f0a07 100%)' }}
    >
      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-6">

          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <div
              className="px-3 py-1.5 rounded-xl text-sm font-extrabold text-yellow-200"
              style={{ background: 'rgba(0,0,0,0.35)', border: '1.5px solid rgba(196,146,42,0.4)' }}
            >
              💰 {profile.bankCoins}
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-4 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">⚔ Card Vault</h1>
            <p
              className="text-[11px] sm:text-sm font-bold mt-2 opacity-90"
              style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
            >
              {limits.min}–{limits.max} cards · Tap a card to equip · Tap a slot to unequip
            </p>
          </div>

          {/* Tab toggle */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setTab('edit')}
              className={`pb-btn pb-btn-${tab === 'edit' ? 'blue' : 'cream'} pb-btn-sm flex-1`}
            >
              ✏️ Edit Deck
            </button>
            <button
              onClick={() => setTab('upgrade')}
              className={`pb-btn pb-btn-${tab === 'upgrade' ? 'gold' : 'cream'} pb-btn-sm flex-1`}
            >
              ⬆ Upgrade Cards
            </button>
          </div>

          {/* Toast */}
          {msg && (
            <div
              className="rounded-xl p-2.5 text-sm mb-3 font-bold pb-pop-in"
              style={{
                background: msg.kind === 'ok' ? 'rgba(46,125,50,0.25)' : 'rgba(198,40,40,0.18)',
                border: `2px solid ${msg.kind === 'ok' ? '#2e7d32' : '#c62828'}`,
              }}
            >
              {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text}
            </div>
          )}

          {/* ── EDIT TAB ── */}
          {tab === 'edit' && (
            <>
              {/* Deck slots panel */}
              <div className="pb-panel px-3 sm:px-4 py-3 mb-3" style={{ color: '#3e2723' }}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="fredoka text-lg flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    Combat Deck
                  </h2>
                  <span
                    className="text-[11px] font-extrabold"
                    style={{ color: deckOk ? '#2e7d32' : '#c62828' }}
                  >
                    {deckCount} / {limits.min}–{limits.max}
                  </span>
                </div>

                {deckCount === 0 ? (
                  <div className="text-xs italic opacity-70 text-center py-6">
                    No cards in deck. Tap a card below to equip.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-start">
                    {profile.combatDeck.map((cardId, i) => (
                      <DeckSlot
                        key={`${cardId}-${i}`}
                        index={i}
                        card={cardMap.get(cardId) ?? null}
                        cardId={cardId}
                        onUnequip={() => unequip(cardId)}
                        onPreview={(t) => setPreview(t)}
                        onClosePreview={() => setPreview(null)}
                      />
                    ))}
                  </div>
                )}

                {!deckOk && deckCount < limits.min && (
                  <div className="text-[11px] mt-3 text-center font-bold opacity-80">
                    Add {limits.min - deckCount} more card{limits.min - deckCount === 1 ? '' : 's'} to reach the minimum.
                  </div>
                )}
              </div>

              {/* Inventory panel */}
              <div className="pb-panel px-3 sm:px-4 py-3" style={{ color: '#3e2723' }}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="fredoka text-lg flex items-center gap-2">
                    <span className="text-xl">🎒</span>
                    Your Cards
                    <span className="text-[11px] ml-2 font-extrabold" style={{ color: '#6d4c2a' }}>
                      {inventoryItems.length} entr{inventoryItems.length === 1 ? 'y' : 'ies'}
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <FilterChip active={filter === 'all'}    onClick={() => setFilter('all')}    label={`All ${ownedActions.length + ownedTactics.length}`} />
                    <FilterChip active={filter === 'action'} onClick={() => setFilter('action')} label={`⚔ ${ownedActions.length}`} />
                    <FilterChip active={filter === 'tactic'} onClick={() => setFilter('tactic')} label={`🧪 ${ownedTactics.length}`} />
                  </div>
                </div>

                {inventoryItems.length === 0 ? (
                  <div className="text-xs italic opacity-70 text-center py-6">
                    No cards in inventory. Visit the Combat Shop to buy some!
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-start">
                    {inventoryItems.map(({ card, available, inDeck }) => (
                      <InventoryCard
                        key={card.id}
                        card={card}
                        available={available}
                        inDeck={inDeck}
                        deckFull={deckCount >= limits.max}
                        onEquip={() => equip(card.id)}
                        onPreview={(t) => setPreview(t)}
                        onClosePreview={() => setPreview(null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── UPGRADE TAB ── */}
          {tab === 'upgrade' && (
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <h2 className="fredoka text-lg flex items-center gap-2 mb-2">
                <span className="text-xl">⬆</span>
                Upgrade Cards
              </h2>
              <p className="text-xs opacity-80 mb-3">
                Sacrifice duplicate cards and pay coins to raise their power tier.
              </p>
              {inventoryItems.length === 0 ? (
                <div className="text-xs italic opacity-70 text-center py-4">No cards in inventory yet.</div>
              ) : (
                <div className="space-y-2">
                  {inventoryItems.map(({ card, owned }) => (
                    <UpgradeRow key={card.id} card={card} owned={owned} />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Card preview popover — fixed, above all panels */}
      {preview && (
        <CardPreviewPopover
          card={preview.card}
          anchorRect={preview.anchorRect}
          onDismiss={() => setPreview(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Long-press (touch) + hover (desktop) preview hook — ported from Plotbound.
// ─────────────────────────────────────────────────────────────────────────────

const LONG_PRESS_MS = 380;

interface UseCardPreviewOpts {
  card: CombatCard | null;
  onPreview: (target: PreviewTarget) => void;
  onClosePreview: () => void;
}

interface PreviewHandlers {
  wrapClick: (handler?: (e: ReactMouseEvent<HTMLElement>) => void) => (e: ReactMouseEvent<HTMLElement>) => void;
  /** Returns true if a long-press just fired and the subsequent click should be ignored. */
  consumeLongPress: () => boolean;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp:   (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave:(e: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnter:(e: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
}

function useCardPreview({ card, onPreview, onClosePreview }: UseCardPreviewOpts): PreviewHandlers {
  const timerRef        = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const isTouchRef      = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
  }
  function rectOf(el: Element) {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  useEffect(() => () => clearTimer(), []);

  return {
    wrapClick: (handler) => (e) => {
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      handler?.(e);
    },
    consumeLongPress: () => {
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        return true;
      }
      return false;
    },
    onPointerDown: (e) => {
      isTouchRef.current = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!isTouchRef.current || !card) return;
      const el = e.currentTarget as HTMLElement;
      clearTimer();
      longPressFiredRef.current = false;
      timerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        onPreview({ card, anchorRect: rectOf(el) });
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => clearTimer(),
    onPointerLeave: () => { clearTimer(); if (!isTouchRef.current) onClosePreview(); },
    onPointerEnter: (e) => {
      if (e.pointerType === 'touch' || e.pointerType === 'pen' || !card) return;
      onPreview({ card, anchorRect: rectOf(e.currentTarget as HTMLElement) });
    },
    onContextMenu: (e) => { if (longPressFiredRef.current) e.preventDefault(); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deck slot — equipped card tile. Double-tap to unequip (with confirm state).
// ─────────────────────────────────────────────────────────────────────────────

function DeckSlot({ index, card, cardId, onUnequip, onPreview, onClosePreview }: {
  index: number;
  card: CombatCard | null;
  cardId: string | null;
  onUnequip: () => void;
  onPreview: (t: PreviewTarget) => void;
  onClosePreview: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const ph = useCardPreview({ card, onPreview, onClosePreview });

  if (!card || !cardId) {
    return (
      <div
        className="rounded-lg flex flex-col items-center justify-center"
        style={{
          width: 120,
          height: 168,
          background: 'rgba(255,255,255,0.04)',
          border: '2px dashed rgba(196,146,42,0.3)',
          color: '#8d6e3f',
        }}
        aria-label={`Empty slot ${index + 1}`}
      >
        <div className="text-2xl opacity-40">+</div>
        <div className="text-[9px] opacity-50 mt-0.5">slot {index + 1}</div>
      </div>
    );
  }

  function handleTap() {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 2200);
    } else {
      onUnequip();
      setConfirm(false);
    }
  }

  return (
    <CombatCard
      card={card}
      size="sm"
      ariaLabel={`${card.name} — tap to unequip, hold for details`}
      onClick={() => { if (ph.consumeLongPress()) return; handleTap(); }}
      onPointerDown={ph.onPointerDown}
      onPointerUp={ph.onPointerUp}
      onPointerLeave={ph.onPointerLeave}
      onPointerEnter={ph.onPointerEnter}
      onContextMenu={ph.onContextMenu}
      fullOverlay={confirm ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(198,40,40,0.78)', color: '#fff' }}
        >
          <div className="text-center px-1">
            <div className="text-[10px] font-extrabold leading-tight">Tap again to</div>
            <div className="text-[12px] font-extrabold leading-tight">UNEQUIP</div>
          </div>
        </div>
      ) : null}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory card — tap to equip one copy into the deck.
// ─────────────────────────────────────────────────────────────────────────────

function InventoryCard({ card, available, inDeck, deckFull, onEquip, onPreview, onClosePreview }: {
  card: CombatCard;
  available: number;
  inDeck: number;
  deckFull: boolean;
  onEquip: () => void;
  onPreview: (t: PreviewTarget) => void;
  onClosePreview: () => void;
}) {
  const disabled = available === 0 || deckFull;
  const ph       = useCardPreview({ card, onPreview, onClosePreview });

  return (
    <CombatCard
      card={card}
      size="sm"
      disabled={disabled}
      ariaLabel={`${card.name} — ${disabled ? (deckFull ? 'deck full' : 'all copies in deck') : 'tap to equip'}`}
      onClick={() => { if (ph.consumeLongPress()) return; if (!disabled) onEquip(); }}
      onPointerDown={ph.onPointerDown}
      onPointerUp={ph.onPointerUp}
      onPointerLeave={ph.onPointerLeave}
      onPointerEnter={ph.onPointerEnter}
      onContextMenu={ph.onContextMenu}
      cornerOverlay={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            background: 'rgba(0,0,0,0.65)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 5,
            padding: '2px 5px',
            color: '#e2e8f0',
            fontFamily: "'Nunito', sans-serif",
            fontWeight: 800,
            fontSize: '0.55rem',
            letterSpacing: '0.05em',
            lineHeight: 1,
          }}
        >
          <span style={{ opacity: 0.75 }}>×</span>
          <span>{available}</span>
          {inDeck > 0 && <span style={{ opacity: 0.55, marginLeft: 3 }}>· {inDeck}d</span>}
        </div>
      }
      fullOverlay={disabled ? (
        <div
          className="absolute inset-0 flex items-end justify-center"
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              marginBottom: 6,
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.62rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              padding: '3px 8px',
              borderRadius: 5,
              background: 'rgba(0,0,0,0.7)',
              color: deckFull ? '#fbbf24' : '#94a3b8',
              border: `1px solid ${deckFull ? '#fbbf24' : '#475569'}55`,
            }}
          >
            {deckFull ? 'DECK FULL' : 'ALL EQUIPPED'}
          </div>
        </div>
      ) : null}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upgrade row — shows card + owned count. Upgrade engine hooks in here later.
// ─────────────────────────────────────────────────────────────────────────────

function UpgradeRow({ card, owned }: { card: CombatCard; owned: number }) {
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
  const act    = isAction(card);

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-lg"
      style={{
        background: 'rgba(15,10,7,0.45)',
        border: `1px solid ${accent}40`,
      }}
    >
      <div style={{ flexShrink: 0 }}>
        <CombatCard card={card} size="sm" />
      </div>
      <div className="flex-1 min-w-0" style={{ color: '#e2e8f0' }}>
        <div className="text-sm font-extrabold flex items-center gap-1.5 truncate" style={{ color: '#f1f5f9' }}>
          {card.name}
          <span
            className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full"
            style={{ background: accent, color: '#0f172a', letterSpacing: '0.06em' }}
          >
            {(RARITY_LABEL[card.rarity] ?? card.rarity).toUpperCase()}
          </span>
        </div>
        <div className="text-[11px] opacity-80 mt-1">
          {act
            ? `⚔ ${(card as ActionCardDef).damage} · ⏳ ${(card as ActionCardDef).charge} · ◆ ${(card as ActionCardDef).cost}`
            : `◆ ${(card as TacticCardDef).cost} · ${(card as TacticCardDef).description}`}
        </div>
        <div className="text-[10px] opacity-55 mt-1">Owned: {owned}</div>
      </div>
      <span
        className="text-[11px] font-extrabold px-3 py-1 rounded-full flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}
      >
        Soon
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter chip — small pill button for the inventory type tabs.
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="text-[10px] font-extrabold px-2 py-1 rounded-full transition-all"
      style={{
        background: active ? '#2e7d32' : 'rgba(0,0,0,0.15)',
        color: active ? '#fff' : '#6d4c2a',
        border: active ? '1.5px solid #2e7d32' : '1.5px solid rgba(120,80,30,0.35)',
      }}
    >
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card preview popover — ported from Plotbound, adapted for combat cards.
// Auto-positions beside the anchor; flips sides when near viewport edge.
// Dismissed by tapping outside (deferred attachment prevents self-dismissal).
// ─────────────────────────────────────────────────────────────────────────────

const POPOVER_W = 280;
const POPOVER_H = 320;

function CardPreviewPopover({ card, anchorRect, onDismiss }: {
  card: CombatCard;
  anchorRect: PreviewTarget['anchorRect'];
  onDismiss: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const accent     = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
  const act        = isAction(card);

  useEffect(() => {
    function handle(e: PointerEvent) {
      const node = popoverRef.current;
      if (!node || (e.target instanceof Node && node.contains(e.target))) return;
      onDismiss();
    }
    const id = window.setTimeout(() => document.addEventListener('pointerdown', handle), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('pointerdown', handle); };
  }, [onDismiss]);

  const vw = typeof window !== 'undefined' ? window.innerWidth  : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const margin = 8;
  const width  = Math.min(POPOVER_W, vw - margin * 2);
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const rightSpace    = vw - (anchorRect.left + anchorRect.width) - margin;
  const leftSpace     = anchorRect.left - margin;

  let topPx: number;
  let leftPx: number;

  if (rightSpace >= width) {
    leftPx = anchorRect.left + anchorRect.width + margin;
    topPx  = anchorCenterY - POPOVER_H / 2;
  } else if (leftSpace >= width) {
    leftPx = anchorRect.left - margin - width;
    topPx  = anchorCenterY - POPOVER_H / 2;
  } else {
    leftPx = Math.max(margin, Math.min(vw - width - margin, anchorRect.left + anchorRect.width / 2 - width / 2));
    const spaceBelow = vh - (anchorRect.top + anchorRect.height) - margin;
    const spaceAbove = anchorRect.top - margin;
    topPx = spaceBelow >= POPOVER_H || spaceBelow > spaceAbove
      ? anchorRect.top + anchorRect.height + margin
      : anchorRect.top - margin - POPOVER_H;
  }
  topPx = Math.max(margin, Math.min(vh - POPOVER_H - margin, topPx));

  const dmgColor = act
    ? (DAMAGE_TYPE_COLOR[(card as ActionCardDef).damageType] ?? '#cbd5e1')
    : '#a78bfa';

  return (
    <div
      ref={popoverRef}
      className="fixed z-[60] pb-pop-in"
      style={{ top: topPx, left: leftPx, width }}
      role="dialog"
      aria-label={`${card.name} details`}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: 12,
          borderRadius: 14,
          background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
          border: `1.5px solid ${accent}`,
          boxShadow: `0 0 24px ${accent}30, 0 14px 30px rgba(0,0,0,0.7)`,
          color: '#e2e8f0',
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <CombatCard card={card} size="sm" />
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div>
            <div style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: '0.95rem',
              color: '#f1f5f9',
              lineHeight: 1.1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {card.name}
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 4,
              flexWrap: 'wrap',
            }}>
              <span style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.6rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                padding: '2px 6px',
                borderRadius: 99,
                background: accent,
                color: '#0f172a',
              }}>
                {(RARITY_LABEL[card.rarity] ?? card.rarity).toUpperCase()}
              </span>
              <span style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.6rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: dmgColor,
              }}>
                {act ? (card as ActionCardDef).damageType.toUpperCase() : 'TACTIC'}
              </span>
            </div>
          </div>

          {act ? (
            <>
              <div style={{
                display: 'flex',
                gap: 5,
                fontFamily: "'Fredoka One', cursive",
                fontSize: '0.7rem',
              }}>
                <PreviewStat glyph="⚔" value={(card as ActionCardDef).damage} color="#fbbf24" />
                <PreviewStat glyph="⏳" value={(card as ActionCardDef).charge} color="#94a3b8" />
                <PreviewStat glyph="◆" value={(card as ActionCardDef).cost} color="#86efac" />
              </div>
              {(card as ActionCardDef).hits !== undefined && (card as ActionCardDef).hits! > 1 && (
                <div style={{ fontSize: '0.65rem', opacity: 0.75 }}>
                  Hits: <b>{(card as ActionCardDef).hits}×</b>
                </div>
              )}
              {(card as ActionCardDef).effect && (
                <div style={{ fontSize: '0.7rem', lineHeight: 1.3, opacity: 0.92, fontStyle: 'italic' }}>
                  {(card as ActionCardDef).effect}
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 5 }}>
                <PreviewStat glyph="◆" value={(card as TacticCardDef).cost} color="#86efac" />
                {(card as TacticCardDef).persistent && (
                  <PreviewStat glyph="∞" value="PERS" color="#c4b5fd" />
                )}
              </div>
              <div style={{ fontSize: '0.7rem', lineHeight: 1.3, opacity: 0.92 }}>
                {(card as TacticCardDef).description}
              </div>
            </>
          )}

          <div style={{
            marginTop: 'auto',
            fontSize: '0.55rem',
            opacity: 0.45,
            fontStyle: 'italic',
          }}>
            Tap outside to close
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ glyph, value, color }: { glyph: string; value: string | number; color: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 3,
      padding: '3px 7px',
      borderRadius: 5,
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${color}30`,
      color,
      fontFamily: "'Fredoka One', cursive",
      fontSize: '0.72rem',
    }}>
      <span style={{ opacity: 0.85 }}>{glyph}</span>
      <span>{value}</span>
    </div>
  );
}
