import { useRef, useState } from 'react';
import { allPerks, getPerk, maxPerkSlots, type Perk, type PerkKind, type Rarity } from '@engine/index';
import { isStarterPerk, perkChargesAvailable, setEquippedPerks, type Profile } from '@storage/index';
import AnimatedBackground from '@ui/components/AnimatedBackground';
import { CardDetailModal } from '@ui/components/CardDetailBody';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onStart: () => void;
  onBack: () => void;
}

// Rarity → border + label color. Mirrors the in-game card stroke palette so
// the equip page reads as the same family of objects as cards in hand.
const rarityColor: Record<Rarity, string> = {
  common: '#a5d6a7',
  uncommon: '#90caf9',
  rare: '#ce93d8',
  epic: '#ffab76',
  legendary: '#ffd54f',
  mythic: '#ff80ab',
};

const rarityLabel: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
};

const rarityOrder: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// Each perk kind gets its own banner color + label so the player can scan
// what a perk DOES at a glance (passive bonus vs combo modifier, etc.).
const kindBanner: Record<PerkKind, { label: string; bg: string; icon: string }> = {
  passive:    { label: 'PASSIVE',    bg: '#3a7d44', icon: '✨' },
  combo_mod:  { label: 'COMBO MOD',  bg: '#c2185b', icon: '🔁' },
  goal:       { label: 'GOAL',       bg: '#1565c0', icon: '🎯' },
  defensive:  { label: 'DEFENSIVE',  bg: '#6a1b9a', icon: '🛡️' },
};

export default function PerkLoadoutScreen({ profile, onProfileChange, onStart, onBack }: Props) {
  const slots = maxPerkSlots(profile.upgradesOwned);
  const [equipped, setLocalEquipped] = useState<string[]>(profile.perksEquipped.slice(0, slots));
  const [detailPerk, setDetailPerk] = useState<Perk | null>(null);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startPerkLongPress(perk: Perk) {
    detailTimerRef.current = setTimeout(() => {
      detailTimerRef.current = null;
      setDetailPerk(perk);
    }, 500);
  }
  function cancelPerkLongPress() {
    if (detailTimerRef.current) { clearTimeout(detailTimerRef.current); detailTimerRef.current = null; }
  }

  // "Available" = starter perks (always permanent) + any perk with at least
  // one consumable charge in inventory. The legacy perksOwned list is kept
  // around for cloud sync but UI now reads off charges to know what the
  // player can actually equip THIS run.
  const availableIds = new Set<string>();
  for (const id of profile.perksOwned) if (isStarterPerk(id)) availableIds.add(id);
  for (const [id, n] of Object.entries(profile.perksInventory)) if (n > 0) availableIds.add(id);

  const owned = Array.from(availableIds)
    .map(id => { try { return getPerk(id); } catch { return null; } })
    .filter((p): p is Perk => !!p)
    .sort((a, b) => rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity));
  const allLockedPerks = allPerks().filter(p => !availableIds.has(p.id));

  function toggle(id: string) {
    if (equipped.includes(id)) {
      setLocalEquipped(equipped.filter(p => p !== id));
    } else if (equipped.length < slots) {
      setLocalEquipped([...equipped, id]);
    }
  }

  function commitAndStart() {
    const next = setEquippedPerks(profile, equipped);
    onProfileChange(next);
    onStart();
  }

  return (
    <div className="h-full w-full relative overflow-hidden text-white safe-top safe-bottom">
      <AnimatedBackground variant="menu" cloudCount={3} leafCount={6} fallingEmojis={['✨', '🌟', '⭐']} />

      <div className="relative z-10 h-full overflow-y-auto">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-4 sm:py-6">
          <div className="flex items-center justify-between mb-4">
            <button onClick={onBack} className="pb-btn pb-btn-cream pb-btn-sm">← Home</button>
            <div className="pb-panel-dark px-3 py-1.5 flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest opacity-75">Slots</span>
              <span className="font-extrabold text-yellow-200 text-base">{equipped.length} / {slots}</span>
            </div>
          </div>

          <div className="text-center mb-5 pb-fade-up">
            <h1 className="pb-title text-3xl sm:text-5xl">⚡ Equip Talents</h1>
            <p className="text-[11px] sm:text-sm opacity-90 mt-2 font-bold" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Pick up to {slots} — tap a card to equip or unequip
            </p>
          </div>

          <h2 className="fredoka text-base sm:text-lg mb-3 flex items-center gap-2"
              style={{ textShadow: '0 2px 0 rgba(0,0,0,0.45)' }}>
            <span className="text-2xl">🎒</span> Owned
            <span className="text-xs opacity-75 font-bold">({owned.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
            {owned.length === 0 && (
              <div className="col-span-full pb-panel px-4 py-6 text-center" style={{ color: '#3e2723' }}>
                <div className="text-3xl mb-2">📭</div>
                <div className="text-sm font-bold">No perks owned yet</div>
                <div className="text-xs opacity-70 mt-1">Reach milestones to unlock new perks!</div>
              </div>
            )}
            {owned.map(perk => (
              <PerkCard
                key={perk.id}
                perk={perk}
                equipped={equipped.includes(perk.id)}
                charges={perkChargesAvailable(profile, perk.id)}
                isStarter={isStarterPerk(perk.id)}
                disabled={!equipped.includes(perk.id) && equipped.length >= slots}
                onClick={() => toggle(perk.id)}
                onLongPress={() => startPerkLongPress(perk)}
                onLongPressCancel={cancelPerkLongPress}
              />
            ))}
          </div>

          <h2 className="fredoka text-base sm:text-lg mb-3 opacity-80 flex items-center gap-2"
              style={{ textShadow: '0 2px 0 rgba(0,0,0,0.45)' }}>
            <span className="text-2xl">🔒</span> Locked
            <span className="text-xs opacity-75 font-bold">({allLockedPerks.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-24">
            {allLockedPerks.map(perk => (
              <PerkCard
                key={perk.id}
                perk={perk}
                equipped={false}
                charges={0}
                isStarter={false}
                disabled
                locked
                onClick={() => {}}
                onLongPress={() => startPerkLongPress(perk)}
                onLongPressCancel={cancelPerkLongPress}
              />
            ))}
          </div>

          <div className="sticky bottom-3 z-20 flex justify-center sm:justify-end">
            <button onClick={commitAndStart} className="pb-btn pb-btn-gold pb-btn-lg pb-pulse">
              ▶ Start Battle
            </button>
          </div>
        </div>
      </div>

      {detailPerk && (
        <CardDetailModal
          target={{ kind: 'talent', perk: detailPerk }}
          onClose={() => setDetailPerk(null)}
        />
      )}
    </div>
  );
}

interface CardProps {
  perk: Perk;
  equipped: boolean;
  disabled: boolean;
  // Charges remaining. Infinity for starter perks, finite for consumables,
  // 0 for locked / out-of-stock. Drives the badge in the top corner.
  charges: number;
  isStarter: boolean;
  locked?: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onLongPressCancel: () => void;
}

function PerkCard({ perk, equipped, disabled, locked, charges, isStarter, onClick, onLongPress, onLongPressCancel }: CardProps) {
  const isNoOp = perk.modifier.type === 'noop';
  const banner = kindBanner[perk.kind];
  const accent = rarityColor[perk.rarity];

  // Card chrome layout mimics the Phaser in-game card: rarity-stroke border,
  // colored banner at the top with kind label, big emoji, name, then the
  // description in the lower band. The ratio is ~ 3:4 to feel card-like.
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onPointerDown={onLongPress}
      onPointerUp={onLongPressCancel}
      onPointerLeave={onLongPressCancel}
      onPointerCancel={onLongPressCancel}
      className={`group relative text-left rounded-xl overflow-hidden transition-all duration-150 ${
        disabled && !locked ? 'cursor-not-allowed' : ''
      } ${equipped ? 'scale-[1.02]' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
      style={{ touchAction: 'none', userSelect: 'none',
        // Outer rarity stroke. Equipped → thick gold inner ring + glow.
        background: equipped
          ? `linear-gradient(180deg, #2d5a35 0%, #1c3d23 100%)`
          : `linear-gradient(180deg, #f5efdd 0%, #e6dcc1 100%)`,
        border: `3px solid ${accent}`,
        boxShadow: equipped
          ? `0 0 0 2px #ffd54f inset, 0 0 14px 2px ${accent}66, 0 4px 10px rgba(0,0,0,0.35)`
          : disabled
            ? '0 2px 4px rgba(0,0,0,0.25)'
            : `0 4px 8px rgba(0,0,0,0.3), 0 0 0 0px ${accent}00`,
        opacity: locked ? 0.55 : disabled ? 0.5 : 1,
        aspectRatio: '3 / 4',
      }}
    >
      {/* Top banner — perk kind */}
      <div
        className="flex items-center justify-center gap-1 py-1 px-2 text-white text-[9px] sm:text-[10px] font-extrabold tracking-wider"
        style={{ background: banner.bg }}
      >
        <span>{banner.icon}</span>
        <span>{banner.label}</span>
      </div>

      {/* Big emoji */}
      <div
        className="flex items-center justify-center"
        style={{ fontSize: 'clamp(34px, 8vw, 56px)', lineHeight: 1, paddingTop: '6px', paddingBottom: '4px' }}
      >
        {perk.icon}
      </div>

      {/* Name + rarity */}
      <div className="px-2 text-center">
        <div
          className="fredoka text-[12px] sm:text-[14px] leading-tight"
          style={{ color: equipped ? '#ffe082' : '#3e2723' }}
        >
          {perk.name}
        </div>
        <div
          className="text-[8px] sm:text-[9px] uppercase tracking-[0.18em] font-bold mt-0.5"
          style={{ color: accent }}
        >
          {rarityLabel[perk.rarity]}
        </div>
      </div>

      {/* Description band at the bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 px-2 py-1.5 text-[10px] sm:text-[11px] leading-snug"
        style={{
          background: equipped ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.55)',
          color: equipped ? '#ffffff' : '#3e2723',
          borderTop: `1px solid ${equipped ? accent : 'rgba(0,0,0,0.1)'}`,
          maxHeight: '42%',
          overflow: 'hidden',
        }}
      >
        {perk.description}
      </div>

      {/* Equipped checkmark badge */}
      {equipped && (
        <div
          className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-md"
          style={{ background: '#ffd54f', color: '#3e2723', border: '2px solid #fff8e1' }}
        >
          ✓
        </div>
      )}

      {/* Charge / starter badge — top-right, slipped down a row when an
          equipped tick is also present. Starter perks are permanent (∞);
          consumable perks show their remaining count. Locked cards skip
          this entirely. */}
      {!locked && (
        <div
          className="absolute right-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full leading-none flex items-center gap-0.5"
          style={{
            top: equipped ? 30 : 4,
            background: isStarter ? '#3a7d44' : charges > 0 ? '#1565c0' : 'rgba(120,80,30,0.6)',
            color: '#fff',
            border: '2px solid rgba(255,255,255,0.6)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        >
          {isStarter ? '★ ∞' : `×${charges}`}
        </div>
      )}

      {/* Locked overlay */}
      {locked && (
        <div className="absolute inset-0 flex items-center justify-center text-3xl bg-black/40">🔒</div>
      )}

      {/* Data-only marker (perk modifier is no-op — informational only) */}
      {isNoOp && !locked && (
        <div className="absolute top-1 left-1 text-[8px] px-1.5 py-0.5 rounded bg-black/40 text-white/70 font-bold tracking-wider">
          INFO
        </div>
      )}
    </button>
  );
}
