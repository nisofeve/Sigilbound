// Sigilbound combat deck builder — Plotbound-style grid management.
// Two tabs: Edit Deck (portrait card grid + inventory) · Upgrade Cards.
// Rarity borders, long-press/hover preview popover, double-tap to unequip.

import { useEffect, useRef, useState, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  allActions,
  allTactics,
  allEquipment,
  allTalents,
  MAX_CARD_LEVEL,
  type ActionCardDef,
  type TacticCardDef,
  type EquipmentDef,
} from '@engine/index';
import {
  addToCombatDeck,
  combatDeckLimits,
  removeFromCombatDeck,
  combatCardUpgradePreview,
  upgradeCombatCard,
  setActiveCombatDeckSet,
  renameCombatDeckSet,
  clearCombatDeckSet,
  copyCombatDeckSet,
  MAX_COMBAT_DECK_SETS,
  type Profile,
} from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { TalentCard } from '@ui/components/TalentCard';
import { RARITY_COLOR } from '@ui/components/GameCard';
import { BattleCardDetail } from '@ui/components/CardDetailBody';

type CombatCard = ActionCardDef | TacticCardDef;
type Tab = 'edit' | 'battle' | 'equipment' | 'talent';
type Filter = 'all' | 'action' | 'tactic';


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
  const [upgradeTarget, setUpgradeTarget] = useState<string | null>(null);
  const [renamingSet, setRenamingSet] = useState<number | null>(null);
  const [renameValue, setRenameValue]  = useState('');
  const [setMenuOpen, setSetMenuOpen]  = useState<number | null>(null);

  const limits = useMemo(() => combatDeckLimits(), []);
  const deckCount = profile.combatDeck.length;

  useEffect(() => {
    if (setMenuOpen === null) return;
    function handle(e: PointerEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-set-menu]')) setSetMenuOpen(null);
    }
    const id = window.setTimeout(() => document.addEventListener('pointerdown', handle), 0);
    return () => { window.clearTimeout(id); document.removeEventListener('pointerdown', handle); };
  }, [setMenuOpen]);
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

  const allEq = useMemo(() => allEquipment(), []);
  const allTal = useMemo(() => allTalents(), []);

  const ownedEquipment = useMemo(() => {
    return allEq.filter(e => (profile.combatCardInventory[e.id] ?? 0) > 0);
  }, [allEq, profile.combatCardInventory]);

  const ownedTalents = useMemo(() => {
    return allTal.filter(t => (profile.perksInventory[t.id] ?? 0) > 0 || profile.perksOwned.includes(t.id));
  }, [allTal, profile.perksInventory, profile.perksOwned]);

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

  function switchSet(idx: number) {
    onProfileChange(setActiveCombatDeckSet(profile, idx));
    setSetMenuOpen(null);
  }

  function startRename(idx: number) {
    setRenamingSet(idx);
    setRenameValue(profile.combatDeckSets[idx]?.name ?? `Deck ${idx + 1}`);
    setSetMenuOpen(null);
  }

  function commitRename() {
    if (renamingSet === null) return;
    const trimmed = renameValue.trim();
    if (trimmed) onProfileChange(renameCombatDeckSet(profile, renamingSet, trimmed));
    setRenamingSet(null);
  }

  function clearSet(idx: number) {
    onProfileChange(clearCombatDeckSet(profile, idx));
    showMsg('ok', 'Deck cleared');
    setSetMenuOpen(null);
  }

  function copySet(fromIdx: number, toIdx: number) {
    onProfileChange(copyCombatDeckSet(profile, fromIdx, toIdx));
    showMsg('ok', `Copied to Deck ${toIdx + 1}`);
    setSetMenuOpen(null);
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <button
              onClick={() => setTab('edit')}
              className={`pb-btn pb-btn-${tab === 'edit' ? 'blue' : 'cream'} pb-btn-sm`}
            >
              ✏️ Edit Deck
            </button>
            <button
              onClick={() => setTab('battle')}
              className={`pb-btn pb-btn-${tab === 'battle' ? 'gold' : 'cream'} pb-btn-sm`}
            >
              ⚔ Battle Cards
            </button>
            <button
              onClick={() => setTab('equipment')}
              className={`pb-btn pb-btn-${tab === 'equipment' ? 'gold' : 'cream'} pb-btn-sm`}
            >
              🛡 Equipment
            </button>
            <button
              onClick={() => setTab('talent')}
              className={`pb-btn pb-btn-${tab === 'talent' ? 'gold' : 'cream'} pb-btn-sm`}
            >
              💎 Talents
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
              {/* Deck set selector */}
              <div className="pb-panel px-3 py-3 mb-3 overflow-x-auto" style={{ color: '#3e2723' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-base">🗂</span>
                  <span className="fredoka text-sm font-bold" style={{ color: '#5d4037' }}>Deck Sets</span>
                </div>
                <div className="flex gap-2 min-w-max pb-1">
                  {Array.from({ length: MAX_COMBAT_DECK_SETS }, (_, i) => {
                    const set = profile.combatDeckSets[i];
                    const active = i === profile.activeCombatDeckSet;
                    const cardCount = set?.cards?.length ?? 0;
                    return (
                      <div key={i} className="relative flex flex-col items-center">
                        <button
                          onClick={() => active ? setSetMenuOpen(setMenuOpen === i ? null : i) : switchSet(i)}
                          className="relative flex flex-col items-center rounded-xl transition-all"
                          style={{
                            padding: '6px 10px',
                            minWidth: 64,
                            background: active
                              ? 'linear-gradient(135deg, rgba(196,146,42,0.25) 0%, rgba(196,146,42,0.1) 100%)'
                              : 'rgba(0,0,0,0.10)',
                            border: active
                              ? '2px solid rgba(196,146,42,0.7)'
                              : '2px solid rgba(120,80,30,0.25)',
                            color: active ? '#c4922a' : '#6d4c2a',
                          }}
                        >
                          <span className="text-[10px] font-extrabold leading-tight truncate max-w-[60px]" style={{ color: active ? '#c4922a' : '#5d4037' }}>
                            {set?.name ?? `Deck ${i + 1}`}
                          </span>
                          <span className="text-[9px] opacity-70 mt-0.5">{cardCount} cards</span>
                          {active && <span className="text-[8px] mt-0.5 font-bold" style={{ color: '#c4922a' }}>ACTIVE ▾</span>}
                        </button>

                        {/* Per-set context menu */}
                        {setMenuOpen === i && (
                          <div
                            className="absolute top-full mt-1 left-0 z-30 rounded-xl overflow-hidden shadow-xl pb-pop-in"
                            style={{
                              background: '#1a0f07',
                              border: '1.5px solid rgba(196,146,42,0.5)',
                              minWidth: 140,
                            }}
                            onClick={e => e.stopPropagation()}
                          >
                            <button
                              onClick={() => startRename(i)}
                              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 transition-colors"
                              style={{ color: '#e2d5b0' }}
                            >
                              ✏️ Rename
                            </button>
                            <button
                              onClick={() => clearSet(i)}
                              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 transition-colors"
                              style={{ color: '#f87171' }}
                            >
                              🗑 Clear deck
                            </button>
                            {Array.from({ length: MAX_COMBAT_DECK_SETS }, (_, j) => j !== i && (
                              <button
                                key={j}
                                onClick={() => copySet(i, j)}
                                className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 transition-colors"
                                style={{ color: '#86efac' }}
                              >
                                📋 Copy → {profile.combatDeckSets[j]?.name ?? `Deck ${j + 1}`}
                              </button>
                            ))}
                            <button
                              onClick={() => setSetMenuOpen(null)}
                              className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 transition-colors border-t"
                              style={{ color: '#94a3b8', borderColor: 'rgba(255,255,255,0.08)' }}
                            >
                              ✕ Close
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rename input */}
              {renamingSet !== null && (
                <div className="pb-panel px-3 py-3 mb-3 flex items-center gap-2" style={{ color: '#3e2723' }}>
                  <span className="text-sm font-bold" style={{ color: '#5d4037' }}>Rename:</span>
                  <input
                    autoFocus
                    className="flex-1 rounded-lg px-2 py-1 text-sm font-bold"
                    style={{
                      background: 'rgba(0,0,0,0.2)',
                      border: '1.5px solid rgba(196,146,42,0.5)',
                      color: '#e2d5b0',
                      outline: 'none',
                    }}
                    maxLength={24}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingSet(null); }}
                  />
                  <button className="pb-btn pb-btn-gold pb-btn-sm" onClick={commitRename}>Save</button>
                  <button className="pb-btn pb-btn-cream pb-btn-sm" onClick={() => setRenamingSet(null)}>Cancel</button>
                </div>
              )}

              {/* Deck slots panel */}
              <div className="pb-panel px-3 sm:px-4 py-3 mb-3" style={{ color: '#3e2723' }}>
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="fredoka text-lg flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    {profile.combatDeckSets[profile.activeCombatDeckSet]?.name ?? 'Combat Deck'}
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

          {/* ── BATTLE CARDS TAB ── */}
          {tab === 'battle' && (
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <h2 className="fredoka text-lg flex items-center gap-2 mb-2">
                <span className="text-xl">⚔</span>
                Battle Cards
              </h2>
              <p className="text-xs opacity-80 mb-3">
                Manage and upgrade your battle cards. Sacrifice duplicate cards to raise their power tier.
              </p>
              {inventoryItems.length === 0 ? (
                <div className="text-xs italic opacity-70 text-center py-4">No cards in inventory yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {inventoryItems.map(({ card, owned }) => {
                    const lv = profile.combatCardTiers[card.id] ?? 1;
                    return (
                      <div key={card.id} className="relative flex flex-col items-center">
                        <CombatCard card={card} size="sm" />
                        <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-[10px] px-1.5 rounded-full border border-gray-600">
                          x{owned}
                        </div>
                        <div
                          className="absolute top-1 right-1 text-[10px] px-1.5 rounded-full"
                          style={{
                            background: 'rgba(0,0,0,0.8)',
                            border: '1px solid var(--sb-gold)',
                            color: 'var(--sb-gold-light)',
                            fontWeight: 800,
                          }}
                        >
                          Lv {lv}
                        </div>
                        <button
                          className="mt-2 sb-btn sb-btn-gold text-[10px] w-full"
                          style={{ padding: '4px 0' }}
                          onClick={() => setUpgradeTarget(card.id)}
                        >
                          {lv >= MAX_CARD_LEVEL ? 'MAX' : 'UPGRADE'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── EQUIPMENT TAB ── */}
          {tab === 'equipment' && (
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <h2 className="fredoka text-lg flex items-center gap-2 mb-2">
                <span className="text-xl">🛡</span>
                Equipment Vault
              </h2>
              <p className="text-xs opacity-80 mb-3">
                Review your collected gear. Equipment provides passive stat bonuses in combat.
              </p>
              {ownedEquipment.length === 0 ? (
                <div className="text-xs italic opacity-70 text-center py-4">No equipment found. Buy some from the shop!</div>
              ) : (
                <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-start">
                  {ownedEquipment.map(eq => {
                    const lv = profile.combatCardTiers[eq.id] ?? 1;
                    return (
                      <div key={eq.id} className="relative flex flex-col items-center">
                        <EquipmentCard equipment={eq} />
                        <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-[10px] px-1.5 rounded-full border border-gray-600">
                          x{profile.combatCardInventory[eq.id] ?? 0}
                        </div>
                        <div
                          className="absolute top-1 right-1 text-[10px] px-1.5 rounded-full"
                          style={{
                            background: 'rgba(0,0,0,0.8)',
                            border: '1px solid var(--sb-gold)',
                            color: 'var(--sb-gold-light)',
                            fontWeight: 800,
                          }}
                        >
                          Lv {lv}
                        </div>
                        <button
                          className="mt-2 sb-btn sb-btn-gold text-[10px]"
                          style={{ padding: '4px 10px' }}
                          onClick={() => setUpgradeTarget(eq.id)}
                        >
                          {lv >= MAX_CARD_LEVEL ? 'MAX' : 'UPGRADE'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TALENTS TAB ── */}
          {tab === 'talent' && (
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <h2 className="fredoka text-lg flex items-center gap-2 mb-2">
                <span className="text-xl">💎</span>
                Talents
              </h2>
              <p className="text-xs opacity-80 mb-3">
                Your collected talents. Most talents are consumable and burn one charge per run.
              </p>
              {ownedTalents.length === 0 ? (
                <div className="text-xs italic opacity-70 text-center py-4">No talents found.</div>
              ) : (
                <div className="flex flex-wrap gap-2 sm:gap-2.5 justify-start">
                  {ownedTalents.map(tal => {
                    const owned = profile.perksInventory[tal.id] ?? 0;
                    const isStarter = profile.perksOwned.includes(tal.id) && owned === 0;
                    return (
                      <div key={tal.id} className="relative">
                        <TalentCard talent={tal} />
                        <div className="absolute top-1 left-1 bg-black bg-opacity-70 text-white text-[10px] px-1.5 rounded-full border border-gray-600">
                          {isStarter ? '∞' : `x${owned}`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Card preview popover — fixed, above all panels */}
      {/* Upgrade Modal */}
      {upgradeTarget && (
        <UpgradeModal
          cardId={upgradeTarget}
          profile={profile}
          onClose={() => setUpgradeTarget(null)}
          onUpgrade={(next) => {
            onProfileChange(next);
            setMsg({ kind: 'ok', text: 'Card upgraded successfully!' });
          }}
          onMsg={(text, kind) => setMsg({ kind, text })}
        />
      )}

      {/* Popover Preview */}
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

const POPOVER_W = 300;
const POPOVER_H = 400;

function CardPreviewPopover({ card, anchorRect, onDismiss }: {
  card: CombatCard;
  anchorRect: PreviewTarget['anchorRect'];
  onDismiss: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;

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
          padding: 14,
          borderRadius: 14,
          background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
          border: `1.5px solid ${accent}`,
          boxShadow: `0 0 24px ${accent}30, 0 14px 30px rgba(0,0,0,0.7)`,
          color: '#e2e8f0',
        }}
      >
        <BattleCardDetail card={card} />
        <div style={{ fontSize: '0.5rem', opacity: 0.3, fontStyle: 'italic', marginTop: 6, textAlign: 'right' }}>
          Tap outside to close
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Upgrade Modal
// ─────────────────────────────────────────────────────────────────────────────

function UpgradeModal({
  cardId,
  profile,
  onClose,
  onUpgrade,
  onMsg,
}: {
  cardId: string;
  profile: Profile;
  onClose: () => void;
  onUpgrade: (next: Profile) => void;
  onMsg: (msg: string, kind: 'err' | 'ok') => void;
}) {
  // Resolve the card across all upgradable surfaces (action / tactic / equipment).
  const action = allActions().find(c => c.id === cardId);
  const tactic = allTactics().find(c => c.id === cardId);
  const equipment = allEquipment().find(e => e.id === cardId);
  const displayCard: ActionCardDef | TacticCardDef | EquipmentDef | undefined = action ?? tactic ?? equipment;
  if (!displayCard) return null;

  const preview = combatCardUpgradePreview(profile, cardId);
  if (!preview) return null;

  const { level, ownedCopies, copies, gold, isMax, nextLevel } = preview;
  const canAffordCopies = ownedCopies >= copies;
  const canAffordGold = profile.bankCoins >= gold;
  const canUpgrade = !isMax && canAffordCopies && canAffordGold;

  function handleUpgrade() {
    if (!canUpgrade) return;
    const res = upgradeCombatCard(profile, cardId);
    if (res.ok) {
      onUpgrade(res.profile);
    } else {
      onMsg(res.reason, 'err');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl overflow-hidden shadow-2xl relative" style={{ background: '#111827', border: '2px solid var(--sb-gold)' }}>

        <div className="px-4 py-3 border-b flex justify-between items-center" style={{ borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="sb-display text-lg" style={{ color: 'var(--sb-gold-light)' }}>
            Upgrade {equipment ? 'Equipment' : 'Card'}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white pb-1 font-bold text-xl">×</button>
        </div>

        <div className="p-5 flex flex-col items-center gap-4">
          <div className="flex gap-4 items-center">
            {action || tactic ? (
              <CombatCard card={displayCard as ActionCardDef | TacticCardDef} size="sm" />
            ) : (
              <EquipmentCard equipment={displayCard as EquipmentDef} size="sm" />
            )}
            <div className="flex flex-col gap-1">
              <div className="font-extrabold text-white text-lg">{displayCard.name}</div>
              <div className="sb-display" style={{ color: 'var(--sb-parchment)' }}>
                Lv. {level} / {MAX_CARD_LEVEL}{isMax ? ' (MAX)' : ` → ${nextLevel}`}
              </div>
              {!isMax && (
                <div className="text-xs opacity-80" style={{ color: '#94a3b8' }}>
                  Each level boosts the base stats of every copy of this {equipment ? 'item' : 'card'}.
                </div>
              )}
            </div>
          </div>

          {!isMax ? (
            <div className="w-full rounded-lg p-3 flex flex-col gap-2" style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--sb-parchment)' }}>Required Copies</span>
                <span className={`text-sm font-bold ${canAffordCopies ? 'text-green-400' : 'text-red-400'}`}>
                  {ownedCopies} / {copies}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: 'var(--sb-parchment)' }}>Upgrade Cost</span>
                <span className={`text-sm font-bold flex items-center gap-1 ${canAffordGold ? 'text-yellow-400' : 'text-red-400'}`}>
                  <span>🪙</span> {gold.toLocaleString()} (You have {profile.bankCoins.toLocaleString()})
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-sm italic" style={{ color: 'var(--sb-gold)' }}>
              This {equipment ? 'item' : 'card'} has reached its maximum potential.
            </div>
          )}

          {!isMax && (
            <button
              className={`w-full py-3 rounded-lg font-extrabold tracking-widest ${canUpgrade ? 'bg-gradient-to-r from-yellow-600 to-amber-500 text-black shadow-lg shadow-yellow-600/20' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
              onClick={handleUpgrade}
              disabled={!canUpgrade}
            >
              UPGRADE NOW
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
