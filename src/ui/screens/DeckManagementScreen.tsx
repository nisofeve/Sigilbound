import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  GRADE_COLOR,
  GRADE_ORDER,
  getCard,
  gradedSellPrice,
  nextGrade,
  upgradeCost,
  type CardId,
  type Grade,
  type Rarity,
} from '@engine/index';
import {
  setDeckPreset,
  setActiveDeckPreset,
  upgradeCardInProfile,
  type DeckEntry,
  type Profile,
} from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';

interface Props {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  onBack: () => void;
}

const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7',
  uncommon: '#90caf9',
  rare: '#ce93d8',
  epic: '#ffab76',
  legendary: '#ffd54f',
  mythic: '#ff80ab',
};

// Fixed deck size — slots are pre-allocated and the player fills them. This
// matches the standard starter deck (12 cards) and gives the screen a
// predictable shape across mobile + desktop. Future upgrades could grow this.
export const DECK_SLOTS = 12;

type Tab = 'edit' | 'upgrade';

// === Slot model ===
//
// The engine's deck representation is `DeckEntry[]` where each entry packs
// (cardId, grade, count). The new UI presents the deck as a flat list of N
// slots, each holding either a single (cardId, grade) instance or empty.
// We expand on read and re-pack on write so the engine API stays unchanged.

interface Slot {
  cardId: CardId | null;
  grade: Grade | null;
}

function expandSlots(entries: DeckEntry[], totalSlots: number): Slot[] {
  const out: Slot[] = [];
  for (const e of entries) {
    for (let i = 0; i < e.count; i++) out.push({ cardId: e.cardId, grade: e.grade });
  }
  while (out.length < totalSlots) out.push({ cardId: null, grade: null });
  return out.slice(0, totalSlots);
}

function packSlots(slots: Slot[]): DeckEntry[] {
  const map = new Map<string, DeckEntry>();
  for (const s of slots) {
    if (!s.cardId || !s.grade) continue;
    const key = `${s.cardId}@${s.grade}`;
    const ex = map.get(key);
    if (ex) ex.count += 1;
    else map.set(key, { cardId: s.cardId, grade: s.grade, count: 1 });
  }
  return Array.from(map.values());
}

interface PreviewTarget {
  cardId: CardId;
  grade: Grade;
  anchorRect: { top: number; left: number; width: number; height: number };
}

export default function DeckManagementScreen({ profile, onProfileChange, onBack }: Props) {
  const [activeIdx, setActiveIdx] = useState(profile.activeDeckPreset);
  const [tab, setTab] = useState<Tab>('edit');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [preview, setPreview] = useState<PreviewTarget | null>(null);

  const preset = profile.deckPresets[activeIdx] ?? { name: 'Empty', entries: [] };
  const slots = expandSlots(preset.entries, DECK_SLOTS);
  const filledCount = slots.filter(s => s.cardId !== null).length;
  const emptyCount = DECK_SLOTS - filledCount;

  // Inventory entries — but reduced by what's already used by the active deck
  // so the player can't equip a 2nd copy if they only own 1.
  const inventoryEntries = buildInventoryEntries(profile, preset.entries);

  function showMsg(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 1800);
  }

  function commitSlots(nextSlots: Slot[]) {
    const entries = packSlots(nextSlots);
    const p = setDeckPreset(profile, activeIdx, { name: profile.deckPresets[activeIdx].name, entries });
    onProfileChange(p);
  }

  function unequipSlot(slotIdx: number) {
    const next = slots.slice();
    next[slotIdx] = { cardId: null, grade: null };
    commitSlots(next);
  }

  function equipFromInventory(cardId: CardId, grade: Grade) {
    // Find the first empty slot. If the deck is full, a quick toast.
    const firstEmpty = slots.findIndex(s => s.cardId === null);
    if (firstEmpty < 0) {
      showMsg('err', 'Deck is full — unequip a slot first.');
      return;
    }
    const next = slots.slice();
    next[firstEmpty] = { cardId, grade };
    commitSlots(next);
  }

  function clearPreset() {
    commitSlots(Array.from({ length: DECK_SLOTS }, () => ({ cardId: null, grade: null })));
  }

  function makeActive() {
    const p = setActiveDeckPreset(profile, activeIdx);
    onProfileChange(p);
    showMsg('ok', `Preset ${activeIdx + 1} is now active.`);
  }

  function tryUpgrade(cardId: CardId, grade: Grade) {
    setBusy(`${cardId}@${grade}`);
    setMsg(null);
    const next = upgradeCardInProfile(profile, cardId, grade);
    setBusy(null);
    if (!next) {
      showMsg('err', 'Upgrade failed — not enough duplicates or coins.');
      return;
    }
    onProfileChange(next);
    showMsg('ok', `Upgraded ${getCard(cardId).name} → ${nextGrade(grade)}!`);
  }

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={5} fallingEmojis={['🌱', '🌿', '✨']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <div className="pb-panel-dark px-3 py-1.5 flex items-center gap-3 text-sm">
              <span className="font-extrabold text-yellow-200">🏦 {profile.bankCoins}</span>
            </div>
          </div>

          <div className="text-center mb-4 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">🃏 Deck Management</h1>
            <p className="text-[11px] sm:text-sm font-bold mt-2 opacity-95" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              {DECK_SLOTS} slots · 5 saved decks · Tap a card to equip · Tap a slot to unequip
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab('edit')} className={`pb-btn pb-btn-${tab === 'edit' ? 'blue' : 'cream'} pb-btn-sm flex-1`}>
              ✏️ Edit Deck
            </button>
            <button onClick={() => setTab('upgrade')} className={`pb-btn pb-btn-${tab === 'upgrade' ? 'gold' : 'cream'} pb-btn-sm flex-1`}>
              ⬆ Upgrade Cards
            </button>
          </div>

          {msg && (
            <div
              className="rounded-xl p-2.5 text-sm mb-3 font-bold pb-pop-in"
              style={{
                background: msg.kind === 'ok' ? 'rgba(46,125,50,0.25)' : 'rgba(198,40,40,0.18)',
                border: `2px solid ${msg.kind === 'ok' ? '#2e7d32' : '#c62828'}`,
                color: '#fff',
              }}
            >
              {msg.kind === 'ok' ? '✓' : '⚠'} {msg.text}
            </div>
          )}

          {tab === 'edit' && (
            <>
              {/* TOP: deck slots panel */}
              <div className="pb-panel px-3 sm:px-4 py-3 mb-3" style={{ color: '#3e2723' }}>
                {/* Header row: title + counter + preset selector */}
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h2 className="fredoka text-lg flex items-center gap-2">
                    <span className="text-xl">📦</span>
                    Deck #{activeIdx + 1}
                    {profile.activeDeckPreset === activeIdx && (
                      <span
                        className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                        style={{ background: '#2e7d32', color: '#fff' }}
                      >
                        ★ ACTIVE
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold" style={{ color: '#6d4c2a' }}>
                      {filledCount} / {DECK_SLOTS}
                    </span>
                  </div>
                </div>

                {/* Preset selector — small chip buttons */}
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest font-extrabold" style={{ color: '#6d4c2a' }}>
                    Set:
                  </span>
                  {profile.deckPresets.map((p, i) => {
                    const isOpen = i === activeIdx;
                    const isActive = i === profile.activeDeckPreset;
                    const count = p.entries.reduce((n, e) => n + e.count, 0);
                    return (
                      <button
                        key={i}
                        onClick={() => setActiveIdx(i)}
                        className="relative rounded-full text-xs font-extrabold transition active:scale-95"
                        style={{
                          width: 30,
                          height: 30,
                          background: isOpen
                            ? 'linear-gradient(180deg, #ffd54f 0%, #f9a825 100%)'
                            : 'rgba(255,255,255,0.55)',
                          color: isOpen ? '#4a2e00' : '#3e2723',
                          border: `2px solid ${isOpen ? 'rgba(255,243,176,0.8)' : 'rgba(120,80,30,0.35)'}`,
                          boxShadow: isOpen
                            ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 0 rgba(0,0,0,0.18)'
                            : '0 2px 0 rgba(0,0,0,0.12)',
                        }}
                        aria-label={`Switch to deck ${i + 1}`}
                        title={`Deck ${i + 1} · ${count} cards`}
                      >
                        {i + 1}
                        {isActive && (
                          <span
                            className="absolute -top-1.5 -right-1.5 text-[8px] font-extrabold px-1 rounded-full"
                            style={{
                              background: '#2e7d32',
                              color: '#fff',
                              border: '1.5px solid #fff',
                              lineHeight: 1.2,
                            }}
                          >
                            ★
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <div className="flex-1" />

                  <button
                    onClick={makeActive}
                    disabled={profile.activeDeckPreset === activeIdx}
                    className="pb-btn pb-btn-gold pb-btn-sm !text-[10px] !py-1"
                  >
                    {profile.activeDeckPreset === activeIdx ? '★ Active' : 'Set Active'}
                  </button>
                  <button
                    onClick={clearPreset}
                    disabled={filledCount === 0}
                    className="pb-btn pb-btn-pink pb-btn-sm !text-[10px] !py-1"
                  >
                    🗑 Clear
                  </button>
                </div>

                {/* Slot grid */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 sm:gap-2.5">
                  {slots.map((slot, i) => (
                    <DeckSlot
                      key={i}
                      index={i}
                      slot={slot}
                      onUnequip={() => unequipSlot(i)}
                      onPreview={(target) => setPreview(target)}
                      onClosePreview={() => setPreview(null)}
                    />
                  ))}
                </div>

                {emptyCount > 0 && (
                  <div className="text-[11px] mt-3 text-center font-bold opacity-80">
                    {emptyCount} empty slot{emptyCount === 1 ? '' : 's'} — tap a card from your inventory below to fill them.
                  </div>
                )}
              </div>

              {/* BOTTOM: card list */}
              <div className="pb-panel px-3 sm:px-4 py-3" style={{ color: '#3e2723' }}>
                <h2 className="fredoka text-lg flex items-center gap-2 mb-3">
                  <span className="text-xl">🎒</span>
                  Your Cards
                  <span className="text-[11px] ml-auto font-extrabold" style={{ color: '#6d4c2a' }}>
                    {inventoryEntries.length} entr{inventoryEntries.length === 1 ? 'y' : 'ies'}
                  </span>
                </h2>
                {inventoryEntries.length === 0 ? (
                  <div className="text-xs italic opacity-70 text-center py-6">
                    No cards in inventory. Visit the shop to buy some!
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {inventoryEntries.map(inv => (
                      <InventoryCard
                        key={`${inv.cardId}@${inv.grade}`}
                        cardId={inv.cardId}
                        grade={inv.grade}
                        available={inv.available}
                        inDeck={inv.inDeck}
                        deckFull={emptyCount === 0}
                        onEquip={() => equipFromInventory(inv.cardId, inv.grade)}
                        onPreview={(target) => setPreview(target)}
                        onClosePreview={() => setPreview(null)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Detail popover — overlays the screen above all panels. Sourced
              from hover (desktop) and long-press (mobile). */}
          {preview && (
            <CardPreviewPopover
              cardId={preview.cardId}
              grade={preview.grade}
              anchorRect={preview.anchorRect}
              onDismiss={() => setPreview(null)}
            />
          )}

          {tab === 'upgrade' && (
            <div className="pb-panel px-4 py-3" style={{ color: '#3e2723' }}>
              <h2 className="fredoka text-lg flex items-center gap-2 mb-2">
                <span className="text-xl">⬆</span>
                Upgrade Cards
              </h2>
              <p className="text-xs opacity-80 mb-3">
                Sacrifice duplicates of the same grade + pay coins to bump one copy up. F → E → D → C → B → A.
              </p>
              {inventoryEntries.length === 0 ? (
                <div className="text-xs italic opacity-70 text-center py-4">
                  No cards in inventory yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {inventoryEntries.map(inv => (
                    <UpgradeRow
                      key={`${inv.cardId}@${inv.grade}`}
                      profile={profile}
                      cardId={inv.cardId}
                      grade={inv.grade}
                      busy={busy === `${inv.cardId}@${inv.grade}`}
                      onUpgrade={() => tryUpgrade(inv.cardId, inv.grade)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================================================
// Inventory entries: owned counts minus copies already in this deck preset.
// `available` is what the player can still drop into a slot now; `inDeck`
// is what's already equipped (informational, also drives the disabled state).
// ===================================================

interface InventoryEntryView {
  cardId: CardId;
  grade: Grade;
  owned: number;
  inDeck: number;
  available: number;
  rarity: Rarity;
}

function buildInventoryEntries(profile: Profile, deckEntries: DeckEntry[]): InventoryEntryView[] {
  const out: InventoryEntryView[] = [];
  for (const [cardId, byGrade] of Object.entries(profile.cardInventory)) {
    for (const grade of GRADE_ORDER) {
      const owned = byGrade?.[grade] ?? 0;
      if (owned <= 0) continue;
      let card;
      try { card = getCard(cardId); } catch { continue; }
      const inDeck = deckEntries.find(e => e.cardId === cardId && e.grade === grade)?.count ?? 0;
      out.push({ cardId, grade, owned, inDeck, available: Math.max(0, owned - inDeck), rarity: card.rarity });
    }
  }
  out.sort((a, b) => {
    const ta = getCardTypeRank(a.cardId);
    const tb = getCardTypeRank(b.cardId);
    if (ta !== tb) return ta - tb;
    const ra = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(a.rarity);
    const rb = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(b.rarity);
    if (ra !== rb) return ra - rb;
    if (a.cardId !== b.cardId) return a.cardId.localeCompare(b.cardId);
    return GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade);
  });
  return out;
}

function getCardTypeRank(cardId: CardId): number {
  try {
    return getCard(cardId).type === 'seed' ? 0 : 1;
  } catch {
    return 2;
  }
}

// ===================================================
// Card preview hook — long-press on touch + hover on desktop.
// Returns the pointer event handlers to spread on the target element. The
// hook tracks a press-hold timer; if the user holds long enough, we fire
// `onPreview` with the element's bounding rect AND mark the in-flight
// gesture as "preview" so the click doesn't run on release.
// ===================================================

const LONG_PRESS_MS = 380;

interface UseCardPreviewOpts {
  // Nullable so empty deck slots can still call this hook (hooks must run
  // unconditionally — see DeckSlot for the rationale). When either field
  // is null the returned handlers are no-ops.
  cardId: CardId | null;
  grade: Grade | null;
  onPreview: (target: PreviewTarget) => void;
  onClosePreview: () => void;
}

interface PreviewHandlers {
  /** Wraps the host element's `onClick` so a long-press gesture suppresses it. */
  wrapClick: (handler?: (e: ReactMouseEvent<HTMLElement>) => void) => (e: ReactMouseEvent<HTMLElement>) => void;
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
}

function useCardPreview({ cardId, grade, onPreview, onClosePreview }: UseCardPreviewOpts): PreviewHandlers {
  // Refs (not state) — these change inside event handlers and we don't want
  // re-renders chained off them.
  const timerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const isTouchRef = useRef(false);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function rectOf(el: Element): { top: number; left: number; width: number; height: number } {
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  // Cleanup on unmount — leftover timers can fire after the component goes
  // away and ping the parent setPreview after we're done.
  useEffect(() => () => clearTimer(), []);

  return {
    wrapClick: (handler) => (e) => {
      // If the long-press already fired, swallow this click — the user wanted
      // to preview, not to perform the underlying action.
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      handler?.(e);
    },
    onPointerDown: (e) => {
      // Treat mouse and touch differently: mouse uses hover, touch uses
      // long-press. We classify by pointerType so a mouse user holding the
      // button doesn't accidentally trigger the touch path.
      isTouchRef.current = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!isTouchRef.current) return;
      if (!cardId || !grade) return; // empty slot — nothing to preview
      const el = e.currentTarget as HTMLElement;
      clearTimer();
      longPressFiredRef.current = false;
      timerRef.current = window.setTimeout(() => {
        longPressFiredRef.current = true;
        onPreview({ cardId, grade, anchorRect: rectOf(el) });
      }, LONG_PRESS_MS);
    },
    onPointerUp: () => {
      clearTimer();
      // Touch: if long-press fired, the popover is now open; close it after
      // the user has had a beat to read by relying on outside-tap dismiss
      // (handled in the popover itself). If long-press didn't fire, this
      // is a normal tap — let `wrapClick` allow the host's onClick through.
    },
    onPointerLeave: () => {
      clearTimer();
      // Desktop: when the cursor leaves the element, close the hover preview.
      // Touch users use outside-tap-to-dismiss, so we only close on leave for
      // mouse pointers.
      if (!isTouchRef.current) onClosePreview();
    },
    onPointerEnter: (e) => {
      // Desktop hover only.
      if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
      if (!cardId || !grade) return; // empty slot — nothing to preview
      const el = e.currentTarget as HTMLElement;
      onPreview({ cardId, grade, anchorRect: rectOf(el) });
    },
    onContextMenu: (e) => {
      // Mobile browsers fire contextmenu on long-press by default — we have
      // already shown our popover, so suppress the native menu.
      if (longPressFiredRef.current) e.preventDefault();
    },
  };
}

// ===================================================
// Deck slot — empty placeholder OR equipped card with tap-to-unequip.
// ===================================================

function DeckSlot({ index, slot, onUnequip, onPreview, onClosePreview }: {
  index: number;
  slot: Slot;
  onUnequip: () => void;
  onPreview: (t: PreviewTarget) => void;
  onClosePreview: () => void;
}) {
  // ALL hooks must run on every render — React tracks them by call order.
  // The empty-slot branch used to early-return between useState and the
  // useCardPreview() call below, so switching presets (which flipped a slot
  // from filled → empty or vice-versa) changed the hook count between
  // renders and threw "Rendered fewer hooks than expected."
  const [confirm, setConfirm] = useState(false);
  const preview = useCardPreview({
    cardId: slot.cardId ?? null,
    grade: slot.grade ?? null,
    onPreview,
    onClosePreview,
  });

  if (!slot.cardId || !slot.grade) {
    return (
      <div
        className="aspect-[3/4] rounded-xl flex flex-col items-center justify-center"
        style={{
          background: 'rgba(255,255,255,0.18)',
          border: '2px dashed rgba(120,80,30,0.45)',
          color: '#6d4c2a',
        }}
        aria-label={`Empty slot ${index + 1}`}
      >
        <div className="text-2xl opacity-60">+</div>
        <div className="text-[9px] uppercase tracking-widest font-extrabold opacity-70 mt-1">Empty</div>
        <div className="text-[8px] opacity-50 mt-0.5">slot {index + 1}</div>
      </div>
    );
  }

  const card = getCard(slot.cardId);
  const isSeed = card.type === 'seed';
  const seedPrice = isSeed ? gradedSellPrice(card.sellPrice, slot.grade) : null;
  const accent = rarityColor[card.rarity];

  function handleTap() {
    if (!confirm) {
      setConfirm(true);
      // Auto-clear confirmation if the user doesn't tap again.
      setTimeout(() => setConfirm(false), 2200);
    } else {
      onUnequip();
      setConfirm(false);
    }
  }

  return (
    <button
      onClick={preview.wrapClick(() => handleTap())}
      onPointerDown={preview.onPointerDown}
      onPointerUp={preview.onPointerUp}
      onPointerLeave={preview.onPointerLeave}
      onPointerEnter={preview.onPointerEnter}
      onContextMenu={preview.onContextMenu}
      className="aspect-[3/4] rounded-xl flex flex-col items-center justify-between p-1.5 transition active:scale-95 relative overflow-hidden"
      style={{
        background: confirm
          ? 'linear-gradient(180deg, #ef9a9a 0%, #c62828 100%)'
          : 'linear-gradient(180deg, #fff 0%, #f5e8c8 100%)',
        border: `3px solid ${confirm ? '#ff8a80' : accent}`,
        color: '#3e2723',
        boxShadow: '0 3px 0 rgba(0,0,0,0.18), 0 5px 12px rgba(0,0,0,0.25)',
      }}
      aria-label={`${card.name} — tap to unequip, hold for details`}
    >
      {confirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
          <div className="text-center px-1">
            <div className="text-[10px] font-extrabold leading-tight">Tap again to</div>
            <div className="text-[12px] font-extrabold leading-tight">UNEQUIP</div>
          </div>
        </div>
      )}
      {/* Type banner */}
      <div
        className="self-stretch text-[8px] uppercase tracking-wider font-extrabold py-0.5 rounded-md"
        style={{ background: isSeed ? '#3a7d44' : '#1565c0', color: '#fff' }}
      >
        {isSeed ? '🌱 SEED' : '🔧 TOOL'}
      </div>
      {/* Emoji */}
      <div className="text-3xl sm:text-4xl leading-none" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.25))' }}>
        {card.emoji}
      </div>
      {/* Name + grade */}
      <div className="self-stretch text-center">
        <div className="fredoka text-[10px] sm:text-[11px] leading-tight truncate">{card.name}</div>
        <div className="flex items-center justify-center gap-1 mt-0.5">
          <GradeBadge grade={slot.grade} color={GRADE_COLOR[slot.grade]} />
          {isSeed && <span className="text-[9px] font-extrabold" style={{ color: '#1b5e20' }}>🌾{seedPrice}</span>}
        </div>
      </div>
    </button>
  );
}

// ===================================================
// Inventory card — tap to equip. Shows owned/in-deck counts.
// ===================================================

function InventoryCard({
  cardId, grade, available, inDeck, deckFull, onEquip, onPreview, onClosePreview,
}: {
  cardId: CardId;
  grade: Grade;
  available: number;
  inDeck: number;
  deckFull: boolean;
  onEquip: () => void;
  onPreview: (t: PreviewTarget) => void;
  onClosePreview: () => void;
}) {
  const card = getCard(cardId);
  const isSeed = card.type === 'seed';
  const seedPrice = isSeed ? gradedSellPrice(card.sellPrice, grade) : null;
  const accent = rarityColor[card.rarity];
  const disabled = available === 0 || deckFull;
  const preview = useCardPreview({ cardId, grade, onPreview, onClosePreview });

  return (
    <button
      onClick={preview.wrapClick(() => onEquip())}
      onPointerDown={preview.onPointerDown}
      onPointerUp={preview.onPointerUp}
      onPointerLeave={preview.onPointerLeave}
      onPointerEnter={preview.onPointerEnter}
      onContextMenu={preview.onContextMenu}
      disabled={disabled}
      className={`rounded-xl p-2 text-left transition active:scale-95 relative ${disabled ? 'cursor-not-allowed' : 'hover:-translate-y-0.5'}`}
      style={{
        background: disabled ? 'rgba(120,80,30,0.18)' : 'rgba(255,255,255,0.65)',
        border: `2px solid ${accent}`,
        color: '#3e2723',
        boxShadow: disabled ? 'none' : '0 2px 0 rgba(0,0,0,0.15)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div className="flex items-center gap-2">
        <div className="text-2xl flex-shrink-0" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.2))' }}>
          {card.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-extrabold flex items-center gap-1 truncate">
            {card.name}
            <GradeBadge grade={grade} color={GRADE_COLOR[grade]} />
          </div>
          <div className="text-[10px] opacity-85 leading-snug">
            {isSeed ? `🌾 ${seedPrice} · ⏱ ${card.growRounds}r` : '🔧 tool'}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] font-bold opacity-80">
          🎒 {available} avail
          {inDeck > 0 && <span className="opacity-60"> · {inDeck} in deck</span>}
        </span>
        <span
          className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
          style={{
            background: disabled ? 'rgba(0,0,0,0.15)' : '#2e7d32',
            color: disabled ? '#6d4c2a' : '#fff',
          }}
        >
          {deckFull ? 'Full' : disabled ? 'All used' : '➕ Equip'}
        </span>
      </div>
    </button>
  );
}

// ===================================================
// Upgrade row (unchanged from previous design — kept compact).
// ===================================================

interface UpgradeRowProps {
  profile: Profile;
  cardId: CardId;
  grade: Grade;
  busy: boolean;
  onUpgrade: () => void;
}

function UpgradeRow({ profile, cardId, grade, busy, onUpgrade }: UpgradeRowProps) {
  const card = getCard(cardId);
  const next = nextGrade(grade);
  const cost = next ? upgradeCost(card.rarity, grade) : null;
  const owned = profile.cardInventory[cardId]?.[grade] ?? 0;
  const haveDupes = cost ? owned : 0;
  const totalNeeded = cost ? cost.duplicates + 1 : 0;
  const canUpgrade = !!cost && haveDupes >= totalNeeded && profile.bankCoins >= cost.coins;
  const accent = rarityColor[card.rarity];
  const isSeed = card.type === 'seed';
  const fromPrice = isSeed ? gradedSellPrice(card.sellPrice, grade) : null;
  const toPrice = isSeed && next ? gradedSellPrice(card.sellPrice, next) : null;

  return (
    <div
      className="flex items-center gap-2 p-2.5 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.5)',
        border: `2px solid ${accent}`,
        borderLeftWidth: 6,
      }}
    >
      <div className="text-3xl flex-shrink-0">{card.emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-extrabold flex items-center gap-1.5 truncate">
          {card.name}
          <GradeBadge grade={grade} color={GRADE_COLOR[grade]} />
          {next && <span className="opacity-50">→</span>}
          {next && <GradeBadge grade={next} color={GRADE_COLOR[next]} />}
        </div>
        {cost ? (
          <div className="text-[10px] opacity-80 mt-0.5">
            <span className={haveDupes >= totalNeeded ? 'font-extrabold' : 'text-red-700 font-extrabold'}>
              {Math.min(owned, totalNeeded)} / {totalNeeded} dupes
            </span>
            <span className="opacity-50 mx-1">·</span>
            <span className={profile.bankCoins >= cost.coins ? 'font-extrabold text-amber-700' : 'font-extrabold text-red-700'}>
              💰 {cost.coins}
            </span>
            {fromPrice !== null && toPrice !== null && (
              <span className="opacity-65 ml-1.5">
                · sells {fromPrice} → <span className="font-extrabold">{toPrice}</span>
              </span>
            )}
          </div>
        ) : (
          <div className="text-[10px] opacity-70 italic mt-0.5">Maxed at A</div>
        )}
      </div>
      {next ? (
        <button
          onClick={onUpgrade}
          disabled={!canUpgrade || busy}
          className="pb-btn pb-btn-gold pb-btn-sm flex-shrink-0"
        >
          ⬆ Upgrade
        </button>
      ) : (
        <span className="text-[11px] font-extrabold px-2 py-1 rounded-full" style={{ background: GRADE_COLOR.A, color: '#1b3a1f' }}>MAX</span>
      )}
    </div>
  );
}

function GradeBadge({ grade, color }: { grade: Grade; color: string }) {
  return (
    <span
      className="inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: color, color: '#1b3a1f', boxShadow: '0 1px 0 rgba(0,0,0,0.18)' }}
    >
      {grade}
    </span>
  );
}

// ===================================================
// Card preview popover — full card detail. Anchored to the source element so
// it appears next to whatever the user hovered/long-pressed. Auto-flips to
// the opposite side if it would clip the viewport. Dismissed on outside-tap.
// ===================================================

const CARD_W = 240;
const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

function CardPreviewPopover({
  cardId, grade, anchorRect, onDismiss,
}: {
  cardId: CardId;
  grade: Grade;
  anchorRect: PreviewTarget['anchorRect'];
  onDismiss: () => void;
}) {
  const card = getCard(cardId);
  const isSeed = card.type === 'seed';
  const seedPrice = isSeed ? gradedSellPrice(card.sellPrice, grade) : null;
  const accent = rarityColor[card.rarity];
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Outside-pointerdown dismiss for touch (and as a desktop fallback when the
  // pointer leaves the source AND the popover hasn't taken focus yet).
  useEffect(() => {
    function handle(e: PointerEvent) {
      const node = popoverRef.current;
      if (!node) return;
      if (e.target instanceof Node && node.contains(e.target)) return;
      onDismiss();
    }
    // Defer attachment by one frame so the pointer event that opened the
    // popover doesn't immediately dismiss it.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', handle);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', handle);
    };
  }, [onDismiss]);

  // Position: prefer right of anchor on desktop (wide), centered above on
  // mobile (narrow viewports). Clamp to stay inside the viewport.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const margin = 8;

  // Tentative width — we'll cap to viewport - 2*margin for very narrow
  // screens. The popover auto-grows vertically to fit content.
  const width = Math.min(CARD_W, vw - margin * 2);

  // Vertical: try to center next to anchor. Bound to viewport.
  let topPx: number;
  let leftPx: number;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;

  // Decide horizontal placement: right of anchor preferred, else left, else
  // centered above/below for tight mobile.
  const rightSpace = vw - (anchorRect.left + anchorRect.width) - margin;
  const leftSpace = anchorRect.left - margin;
  if (rightSpace >= width) {
    leftPx = anchorRect.left + anchorRect.width + margin;
    topPx = anchorCenterY - 120; // approximate; clamped below
  } else if (leftSpace >= width) {
    leftPx = anchorRect.left - margin - width;
    topPx = anchorCenterY - 120;
  } else {
    // Center horizontally; place above OR below depending on which has more room.
    leftPx = Math.max(margin, Math.min(vw - width - margin, anchorRect.left + anchorRect.width / 2 - width / 2));
    const spaceAbove = anchorRect.top - margin;
    const spaceBelow = vh - (anchorRect.top + anchorRect.height) - margin;
    topPx = spaceBelow >= 220 || spaceBelow > spaceAbove
      ? anchorRect.top + anchorRect.height + margin
      : anchorRect.top - margin - 220; // approximate height
  }
  // Final vertical clamp.
  topPx = Math.max(margin, Math.min(vh - 220 - margin, topPx));

  return (
    <div
      ref={popoverRef}
      className="fixed z-[60] pb-pop-in"
      style={{ top: topPx, left: leftPx, width }}
      role="dialog"
      aria-label={`${card.name} details`}
    >
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #fffaf2 0%, #f5e8c8 100%)',
          border: `4px solid ${accent}`,
          color: '#3e2723',
          boxShadow: '0 8px 0 rgba(0,0,0,0.2), 0 14px 26px rgba(0,0,0,0.4)',
        }}
      >
        {/* Type banner */}
        <div
          className="text-white text-[10px] uppercase tracking-widest font-extrabold py-1 text-center"
          style={{ background: isSeed ? '#3a7d44' : '#1565c0', textShadow: '0 1px 0 rgba(0,0,0,0.3)' }}
        >
          {isSeed ? '🌱 SEED' : '🔧 TOOL'}
        </div>

        <div className="p-3">
          {/* Big emoji + name + grade + rarity */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex-shrink-0"
              style={{
                fontSize: 42,
                lineHeight: 1,
                filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))',
              }}
            >
              {card.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="fredoka text-base leading-tight">{card.name}</div>
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                <span
                  className="text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full"
                  style={{ background: accent, color: '#1b3a1f' }}
                >
                  {RARITY_LABEL[card.rarity]}
                </span>
                <GradeBadge grade={grade} color={GRADE_COLOR[grade]} />
              </div>
            </div>
          </div>

          {/* Stats / effect */}
          {isSeed ? (
            <div className="rounded-lg p-2 mb-2 text-[12px] font-bold flex items-center justify-around"
                 style={{ background: 'rgba(0,0,0,0.07)' }}>
              <span style={{ color: '#1b5e20' }}>🌾 Sells {seedPrice}c</span>
              <span style={{ color: '#5d4037' }}>⏱ {card.growRounds} round{card.growRounds === 1 ? '' : 's'}</span>
            </div>
          ) : (
            <div className="rounded-lg p-2 mb-2 text-[11px] leading-snug"
                 style={{ background: 'rgba(25,118,210,0.12)', border: '1.5px solid rgba(25,118,210,0.28)' }}>
              <div className="text-[10px] uppercase tracking-widest font-extrabold mb-1" style={{ color: '#1565c0' }}>
                {card.persistent ? 'Persistent Effect' : 'Instant Effect'}
              </div>
              <div className="font-bold">{card.effect}</div>
            </div>
          )}

          {/* Crop type or extra effect line */}
          {isSeed && card.effect && (
            <div className="text-[11px] leading-snug mb-2 italic opacity-90">
              {card.effect}
            </div>
          )}
          {isSeed && (
            <div className="text-[10px] opacity-70">Crop type: <span className="font-bold capitalize">{card.crop}</span></div>
          )}

          <div className="text-[10px] mt-2 opacity-60 text-center italic">
            Tap outside to close · Hold any card for details
          </div>
        </div>
      </div>
    </div>
  );
}
