import { useMemo, useState, useRef } from 'react';
import {
  allStages,
  allTalents,
  allEquipment,
  emptyEquippedSet,
  equip,
  maxPerkSlots,
  getEnemy,
  type CombatStageDef,
  type EquippedSet,
  type Perk,
  type EquipmentSlot,
  EQUIPMENT_SLOTS,
  type EquipmentDef,
} from '@engine/index';
import { EnemyCard } from '@ui/components/EnemyCard';
import { TalentCard } from '@ui/components/TalentCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { CardDetailModal } from '@ui/components/CardDetailBody';
import DeckCarousel from '@ui/components/DeckCarousel';
import { perkChargesAvailable, isStarterPerk, setEquippedPerks } from '@storage/index';
import type { Profile } from '@storage/index';

interface Props {
  stageNumber: number;
  onBegin: (input: {
    stageNumber: number;
    talents: ReadonlyArray<Perk>;
    equipment: EquippedSet;
    hardcore: boolean;
  }) => void;
  onQuit: () => void;
  onDeck?: () => void;
  onProfileChange?: (next: Profile) => void;
  ownedUpgradeIds?: ReadonlyArray<string>;
  profile: Profile;
}

const BIOME_ACCENTS: Record<string, { bg: string; border: string; glow: string; label: string }> = {
  forest:    { bg: 'rgba(34,89,46,0.3)',   border: '#4ade80', glow: 'rgba(74,222,128,0.4)',  label: 'Whispering Forest' },
  crypts:    { bg: 'rgba(67,40,80,0.35)',  border: '#a78bfa', glow: 'rgba(167,139,250,0.4)', label: 'Sunken Crypts' },
  frostpeak: { bg: 'rgba(30,64,100,0.35)', border: '#93c5fd', glow: 'rgba(147,197,253,0.45)',label: 'Frostpeak Hollows' },
  volcano:   { bg: 'rgba(120,28,12,0.4)',  border: '#f97316', glow: 'rgba(249,115,22,0.45)', label: 'Volcanic Forge' },
  ashen:     { bg: 'rgba(80,15,40,0.5)',   border: '#ec4899', glow: 'rgba(236,72,153,0.5)',  label: 'Ashen Citadel' },
};

function slotLabel(slot: EquipmentSlot): string {
  switch (slot) {
    case 'weapon':  return '⚔ Weapon';
    case 'offhand': return '🛡 Off-Hand';
    case 'helm':    return '⛑ Helm';
    case 'armor':   return '🥋 Armor';
    case 'ring':    return '💍 Ring';
    case 'amulet':  return '📿 Amulet';
  }
}

function slotEmoji(slot: EquipmentSlot): string {
  switch (slot) {
    case 'weapon':  return '⚔';
    case 'offhand': return '🛡';
    case 'helm':    return '⛑';
    case 'armor':   return '🥋';
    case 'ring':    return '💍';
    case 'amulet':  return '📿';
  }
}

function TalentChargeBadge({ profile, talentId }: { profile: Profile; talentId: string }) {
  const starter = isStarterPerk(talentId);
  const charges = perkChargesAvailable(profile, talentId);
  return (
    <div style={{
      position: 'absolute', bottom: 4, right: 4,
      background: starter ? '#3a7d44' : charges > 0 ? '#1565c0' : 'rgba(120,80,30,0.7)',
      color: '#fff',
      border: '1.5px solid rgba(255,255,255,0.55)',
      borderRadius: 999,
      fontSize: '0.55rem', fontWeight: 800,
      fontFamily: "'Nunito', sans-serif",
      letterSpacing: '0.08em',
      padding: '1px 5px', lineHeight: 1.5,
      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      pointerEvents: 'none', whiteSpace: 'nowrap',
    }}>
      {starter ? '★ ∞' : `×${charges}`}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="sb-display" style={{ fontSize: 9, color: 'var(--sb-gold-light)', letterSpacing: '0.25em' }}>{title}</div>
      <div className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.85 }}>{count}</div>
    </div>
  );
}

function EmptySlotCard({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  const CARD_W = 68;
  const CARD_H = Math.round(CARD_W * 1.42);
  return (
    <button
      onClick={onClick}
      title={`Equip ${label}`}
      style={{
        width: CARD_W, height: CARD_H, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4,
        background: 'rgba(0,0,0,0.35)',
        border: '1.5px dashed rgba(255,235,180,0.2)',
        borderRadius: 8, cursor: 'pointer',
        transition: 'border-color 150ms ease, background 150ms ease',
      }}
    >
      <span style={{ fontSize: 20, opacity: 0.35, lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: '0.5rem', fontFamily: "'Nunito', sans-serif", fontWeight: 800, letterSpacing: '0.12em', color: 'rgba(255,235,180,0.25)', textTransform: 'uppercase' }}>{label}</span>
    </button>
  );
}

export default function StageInfoScreen({ stageNumber, onBegin, onQuit, onDeck, onProfileChange, ownedUpgradeIds = [], profile }: Props) {
  const initialEquippedTalents = useMemo<(string | null)[]>(() => {
    return profile.perksEquipped.map(id => {
      if (isStarterPerk(id)) return id;
      return perkChargesAvailable(profile, id) > 0 ? id : null;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [equippedTalents, setEquippedTalents] = useState<(string | null)[]>(initialEquippedTalents);
  const [equippedGear, setEquippedGear] = useState<EquippedSet>(emptyEquippedSet());
  const [pickerSlot, setPickerSlot] = useState<EquipmentSlot | null>(null);
  const [talentPickerSlot, setTalentPickerSlot] = useState<number | null>(null);
  const [detailTarget, setDetailTarget] = useState<
    | { kind: 'equipment'; eq: EquipmentDef }
    | { kind: 'talent'; perk: Perk }
    | null
  >(null);
  const detailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startDetailLongPress(target: { kind: 'equipment'; eq: EquipmentDef } | { kind: 'talent'; perk: Perk }) {
    detailTimerRef.current = setTimeout(() => {
      detailTimerRef.current = null;
      setDetailTarget(target);
    }, 500);
  }
  function cancelDetailLongPress() {
    if (detailTimerRef.current) { clearTimeout(detailTimerRef.current); detailTimerRef.current = null; }
  }

  const talentSlotCount = Math.min(4, maxPerkSlots(Array.from(ownedUpgradeIds)));
  const stages = useMemo(() => allStages(), []);
  const talents = useMemo(() => allTalents(), []);
  const allEq = useMemo(() => allEquipment(), []);

  const stage: CombatStageDef = stages.find(s => s.number === stageNumber) ?? stages[0];
  const stageAccent = BIOME_ACCENTS[stage.biome] ?? BIOME_ACCENTS.forest;
  const equippedSlots = (Object.keys(equippedGear) as EquipmentSlot[]).filter(s => !!equippedGear[s]);

  const enemies = stage.enemyIds
    .map(id => getEnemy(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);

  const stageStars = profile.stageStars[stageNumber] ?? 0;
  const isBoss = stage.isBoss || stageNumber % 10 === 0;

  function setSlot(slot: EquipmentSlot, equipmentId: string | null) {
    setEquippedGear(prev => {
      if (!equipmentId) { const next = { ...prev }; delete next[slot]; return next; }
      const def = allEq.find(e => e.id === equipmentId);
      if (!def) return prev;
      return equip(prev, def);
    });
  }

  function commitTalents(updater: (prev: (string | null)[]) => (string | null)[]) {
    setEquippedTalents(prev => {
      const next = updater(prev);
      const flat = next.filter((id): id is string => id !== null);
      if (onProfileChange) onProfileChange(setEquippedPerks(profile, flat));
      return next;
    });
  }

  function begin() {
    const talentObjs = talents.filter(t => equippedTalents.includes(t.id));
    onBegin({ stageNumber, talents: talentObjs, equipment: equippedGear, hardcore: false });
  }

  const equippedTalentCount = equippedTalents.filter((id): id is string => id !== null).length;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-1.5 flex-shrink-0">
        <button onClick={onQuit} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', minHeight: 32 }}>
          ← QUIT
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          ⚔ STAGE {stageNumber}
        </div>
        <div style={{ width: 64 }} />
      </div>

      {/* ── STAGE HERO PANEL ── */}
      <div className="relative z-10 px-3 flex-shrink-0">
        <div
          className="px-2 py-1.5 mb-1 relative"
          style={{
            background: `linear-gradient(180deg, ${stageAccent.bg} 0%, rgba(0,0,0,0.45) 100%)`,
            border: `2px solid ${stageAccent.border}`,
            borderRadius: 4,
            boxShadow: `inset 0 1px 0 rgba(255,235,180,0.18), 0 0 12px ${stageAccent.glow}, var(--sb-shadow-md)`,
          }}
        >
          {/* Title row */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-baseline gap-2 min-w-0 flex-1">
              <div className="sb-display flex-shrink-0" style={{ fontSize: 22, color: 'var(--sb-gold-light)', lineHeight: 1 }}>
                {stageNumber}
              </div>
              <div className="sb-display truncate" style={{ fontSize: 13, color: 'var(--sb-gold-light)', letterSpacing: '0.05em' }}>
                {isBoss ? '👑 ' : ''}{stage.title}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Stars */}
              <div style={{ display: 'flex', gap: 2 }}>
                {[1, 2, 3].map(i => (
                  <span key={i} style={{ fontSize: 12, color: stageStars >= i ? '#fbbf24' : 'rgba(255,255,255,0.12)' }}>★</span>
                ))}
              </div>
              <div className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.85 }}>
                💰 {stage.rewardChest.baseGold}g
              </div>
            </div>
          </div>

          {/* Enemy strip */}
          {enemies.length > 0 && (
            <div className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-0.5">
              {enemies.map((enemy, idx) => (
                <div key={idx} style={{ flex: '0 0 auto' }}>
                  <EnemyCard enemy={enemy} size="xs" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── LOADOUT (talents + equipment) ── */}
      <div className="relative z-10 flex-1 min-h-0 px-3 flex flex-col gap-2 justify-center">

        {/* Talents row */}
        <SectionHeader title="✦ TALENTS" count={`${equippedTalentCount}/${talentSlotCount}`} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {Array.from({ length: talentSlotCount }).map((_, slotIdx) => {
            const talentId = equippedTalents[slotIdx];
            const talent = talentId ? talents.find(t => t.id === talentId) : null;
            return talent ? (
              <div
                key={slotIdx}
                style={{ flexShrink: 0, cursor: 'pointer', position: 'relative' }}
                onClick={() => setTalentPickerSlot(slotIdx)}
                onPointerDown={() => startDetailLongPress({ kind: 'talent', perk: talent })}
                onPointerUp={cancelDetailLongPress}
                onPointerLeave={cancelDetailLongPress}
                onPointerCancel={cancelDetailLongPress}
              >
                <TalentCard talent={talent} customWidth={68} />
                <TalentChargeBadge profile={profile} talentId={talent.id} />
              </div>
            ) : (
              <EmptySlotCard key={slotIdx} icon="◇" label={`SLOT ${slotIdx + 1}`} onClick={() => setTalentPickerSlot(slotIdx)} />
            );
          })}
        </div>

        {/* Equipment row */}
        <SectionHeader title="✦ EQUIPMENT" count={`${equippedSlots.length}/6`} />
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {(EQUIPMENT_SLOTS as EquipmentSlot[]).map(slot => {
            const equipped = equippedGear[slot];
            return equipped ? (
              <div
                key={slot}
                style={{ flexShrink: 0, cursor: 'pointer' }}
                onClick={() => setPickerSlot(slot)}
                onPointerDown={() => startDetailLongPress({ kind: 'equipment', eq: equipped })}
                onPointerUp={cancelDetailLongPress}
                onPointerLeave={cancelDetailLongPress}
                onPointerCancel={cancelDetailLongPress}
              >
                <EquipmentCard equipment={equipped} customWidth={68} />
              </div>
            ) : (
              <EmptySlotCard key={slot} icon={slotEmoji(slot)} label={slotLabel(slot).replace(/^[^\s]+\s/, '')} onClick={() => setPickerSlot(slot)} />
            );
          })}
        </div>
      </div>

      {/* ── BEGIN BUTTON ── */}
      <div
        className="relative z-20 flex-shrink-0 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(15,10,7,0.85) 25%, rgba(15,10,7,0.95) 100%)',
          borderTop: '1px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.5)',
        }}
      >
        {onProfileChange && onDeck && (
          <div style={{ marginBottom: 8 }}>
            <DeckCarousel profile={profile} onProfileChange={onProfileChange} onOpenDeck={onDeck} />
          </div>
        )}
        <button
          onClick={begin}
          className="sb-btn sb-pulse-crimson w-full"
          style={{ fontSize: '15px', padding: '14px 18px', letterSpacing: '0.2em' }}
        >
          <span className="flex flex-col items-center leading-tight">
            <span>⚔  BEGIN STAGE {stageNumber}  ⚔</span>
            <span className="sb-mono mt-0.5 opacity-80" style={{ fontSize: '9px', letterSpacing: '0.3em' }}>
              {equippedTalentCount} TALENT{equippedTalentCount === 1 ? '' : 'S'} · {equippedSlots.length}/6 GEAR
            </span>
          </span>
        </button>
      </div>

      {/* Equipment picker modal */}
      {pickerSlot && (
        <EquipmentPickerModal
          slot={pickerSlot}
          currentlyEquipped={equippedGear[pickerSlot] ?? null}
          availableEquipment={allEq.filter(e => e.slot === pickerSlot && (profile.combatCardInventory[e.id] ?? 0) > 0)}
          onSelect={(equipDef) => { setSlot(pickerSlot, equipDef.id); setPickerSlot(null); }}
          onUnequip={() => { setSlot(pickerSlot, null); setPickerSlot(null); }}
          onClose={() => setPickerSlot(null)}
          onLongPress={(eq) => startDetailLongPress({ kind: 'equipment', eq })}
          onLongPressCancel={cancelDetailLongPress}
        />
      )}

      {/* Talent picker modal */}
      {talentPickerSlot !== null && (
        <TalentPickerModal
          slotNumber={talentPickerSlot}
          currentlyEquipped={equippedTalents[talentPickerSlot] ?? null}
          availableTalents={talents.filter(t => (profile.perksInventory[t.id] ?? 0) > 0 || profile.perksOwned.includes(t.id))}
          equippedTalentIds={equippedTalents.filter((id): id is string => id !== null)}
          maxSlots={talentSlotCount}
          profile={profile}
          onSelect={(talentId) => {
            commitTalents(prev => {
              const next = [...prev];
              while (next.length <= talentPickerSlot) next.push(null);
              next[talentPickerSlot] = talentId;
              while (next.length > 0 && !next[next.length - 1]) next.pop();
              return next;
            });
            setTalentPickerSlot(null);
          }}
          onUnequip={() => {
            commitTalents(prev => {
              const next = [...prev];
              next[talentPickerSlot] = null;
              while (next.length > 0 && !next[next.length - 1]) next.pop();
              return next;
            });
            setTalentPickerSlot(null);
          }}
          onClose={() => setTalentPickerSlot(null)}
          onLongPress={(perk) => startDetailLongPress({ kind: 'talent', perk })}
          onLongPressCancel={cancelDetailLongPress}
        />
      )}

      {detailTarget && (
        <CardDetailModal target={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </div>
  );
}

/* ─── Equipment Picker Modal ─────────────────────────────────────────────── */

function EquipmentPickerModal({
  slot, currentlyEquipped, availableEquipment, onSelect, onUnequip, onClose, onLongPress, onLongPressCancel,
}: {
  slot: EquipmentSlot;
  currentlyEquipped: EquipmentDef | null;
  availableEquipment: EquipmentDef[];
  onSelect: (eq: EquipmentDef) => void;
  onUnequip: () => void;
  onClose: () => void;
  onLongPress: (eq: EquipmentDef) => void;
  onLongPressCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-stone-900 rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)', border: '2px solid var(--sb-bronze-dark)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="sb-display text-lg" style={{ color: 'var(--sb-gold-light)' }}>{slotLabel(slot)}</h2>
          <button onClick={onClose} className="sb-chip" style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
        </div>
        {currentlyEquipped && (
          <button onClick={onUnequip} className="sb-btn w-full mb-4" style={{ fontSize: '12px', padding: '10px 16px' }}>🗑 UNEQUIP</button>
        )}
        <div className="grid grid-cols-2 gap-3">
          {availableEquipment.map(eq => (
            <button
              key={eq.id}
              onClick={() => onSelect(eq)}
              onPointerDown={() => onLongPress(eq)}
              onPointerUp={onLongPressCancel}
              onPointerLeave={onLongPressCancel}
              onPointerCancel={onLongPressCancel}
              style={{ cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
            >
              <EquipmentCard equipment={eq} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Talent Picker Modal ────────────────────────────────────────────────── */

function TalentPickerModal({
  slotNumber, currentlyEquipped, availableTalents, equippedTalentIds, maxSlots: _, profile,
  onSelect, onUnequip, onClose, onLongPress, onLongPressCancel,
}: {
  slotNumber: number;
  currentlyEquipped: string | null;
  availableTalents: Perk[];
  equippedTalentIds: string[];
  maxSlots: number;
  profile: Profile;
  onSelect: (talentId: string) => void;
  onUnequip: () => void;
  onClose: () => void;
  onLongPress: (perk: Perk) => void;
  onLongPressCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-stone-900 rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)', border: '2px solid var(--sb-bronze-dark)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="sb-display text-lg" style={{ color: 'var(--sb-gold-light)' }}>Slot {slotNumber + 1} — Talent</h2>
          <button onClick={onClose} className="sb-chip" style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
        </div>
        {currentlyEquipped && (
          <button onClick={onUnequip} className="sb-btn w-full mb-4" style={{ fontSize: '12px', padding: '10px 16px' }}>🗑 UNEQUIP</button>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))' }}>
          {availableTalents.map(talent => {
            const isEquipped = equippedTalentIds.includes(talent.id);
            const isOtherSlot = isEquipped && talent.id !== currentlyEquipped;
            return (
              <button
                key={talent.id}
                onClick={() => onSelect(talent.id)}
                disabled={isOtherSlot}
                onPointerDown={() => onLongPress(talent)}
                onPointerUp={onLongPressCancel}
                onPointerLeave={onLongPressCancel}
                onPointerCancel={onLongPressCancel}
                style={{ cursor: isOtherSlot ? 'not-allowed' : 'pointer', opacity: isOtherSlot ? 0.5 : 1, touchAction: 'none', userSelect: 'none', position: 'relative' }}
                title={isOtherSlot ? 'Already equipped in another slot' : ''}
              >
                <TalentCard talent={talent} size="sm" selected={isEquipped} />
                <TalentChargeBadge profile={profile} talentId={talent.id} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
