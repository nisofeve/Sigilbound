import { useMemo, useState, useRef, useEffect } from 'react';
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

interface Props {
  onBegin: (input: {
    stageNumber: number;
    talents: ReadonlyArray<Perk>;
    equipment: EquippedSet;
    hardcore: boolean;
  }) => void;
  onBack: () => void;
  currentStage?: number;
  ownedUpgradeIds?: ReadonlyArray<string>;
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

export default function CombatHomeScreen({ onBegin, onBack, currentStage = 100, ownedUpgradeIds = [] }: Props) {
  const [selectedStage, setSelectedStage] = useState<number>(currentStage);
  const [equippedTalents, setEquippedTalents] = useState<(string | null)[]>([]);
  const [equippedGear, setEquippedGear] = useState<EquippedSet>(emptyEquippedSet());
  const [hardcore, setHardcore] = useState<boolean>(false);
  const [pickerSlot, setPickerSlot] = useState<EquipmentSlot | null>(null);
  const [talentPickerSlot, setTalentPickerSlot] = useState<number | null>(null);

  const talentSlotCount = Math.min(4, maxPerkSlots(Array.from(ownedUpgradeIds)));

  const stages = useMemo(() => allStages(), []);
  const talents = useMemo(() => allTalents(), []);
  const allEq = useMemo(() => allEquipment(), []);

  const stage: CombatStageDef = stages.find(s => s.number === selectedStage) ?? stages[0];
  const stageAccent = BIOME_ACCENTS[stage.biome] ?? BIOME_ACCENTS.forest;
  const equippedSlots = (Object.keys(equippedGear) as EquipmentSlot[]).filter(s => !!equippedGear[s]);

  function toggleTalent(id: string) {
    setEquippedTalents(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= talentSlotCount) {
        return [...prev.slice(prev.length - talentSlotCount + 1), id];
      }
      return [...prev, id];
    });
  }

  function setSlot(slot: EquipmentSlot, equipmentId: string | null) {
    setEquippedGear(prev => {
      if (!equipmentId) {
        const next = { ...prev };
        delete next[slot];
        return next;
      }
      const def = allEq.find(e => e.id === equipmentId);
      if (!def) return prev;
      return equip(prev, def);
    });
  }

  function begin() {
    const talentObjs = talents.filter(t => equippedTalents.includes(t.id));
    onBegin({
      stageNumber: selectedStage,
      talents: talentObjs,
      equipment: equippedGear,
      hardcore,
    });
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom">

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
          ← HOME
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          ⚔ COMBAT
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Scrollable middle content */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-1">

        {/* Hero panel — selected stage */}
        <StageHeroPanel
          stage={stage}
          accent={stageAccent}
          isCurrent={selectedStage === currentStage}
        />

        {/* Horizontal stage strip */}
        <StageStrip
          stages={stages}
          selectedStage={selectedStage}
          currentStage={currentStage}
          onSelectStage={setSelectedStage}
          biomeAccents={BIOME_ACCENTS}
        />

        {/* Talents section — slot grid */}
        <div className="mb-1 mt-1">
          <div className="mb-1 flex items-center justify-between">
            <div className="sb-display text-[9px]" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}>
              ✦ TALENTS
            </div>
            <div className="sb-mono text-[8px] opacity-70">{equippedTalents.filter((id): id is string => id !== null).length}/{talentSlotCount}</div>
          </div>
          <div className="grid gap-1 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: talentSlotCount }).map((_, slotIdx) => {
              const talentId = equippedTalents[slotIdx];
              const talent = talentId && talentId !== null ? talents.find(t => t.id === talentId) : null;
              return (
                <button
                  key={slotIdx}
                  onClick={() => setTalentPickerSlot(slotIdx)}
                  style={{ cursor: 'pointer' }}
                >
                  {talent ? (
                    <TalentSlotCard talent={talent} slotNumber={slotIdx + 1} selected={true} />
                  ) : (
                    <EmptyTalentSlotCard slotNumber={slotIdx + 1} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Equipment section */}
        <div className="mb-1">
          <div className="mb-1 flex items-center justify-between">
            <div className="sb-display text-[9px]" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.2em' }}>
              ✦ EQUIPMENT
            </div>
            <div className="sb-mono text-[8px] opacity-70">{equippedSlots.length}/6</div>
          </div>
          <div className="grid gap-1 grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
            {(EQUIPMENT_SLOTS as EquipmentSlot[]).map(slot => {
              const equipped = equippedGear[slot];
              return (
                <button
                  key={slot}
                  onClick={() => setPickerSlot(slot)}
                  style={{ cursor: 'pointer' }}
                >
                  {equipped ? (
                    <EquipmentCard equipment={equipped} />
                  ) : (
                    <EmptyEquipmentSlotCard slot={slot} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Hardcore toggle */}
        <label
          className="flex items-center gap-1.5 mb-1 p-1.5 cursor-pointer select-none"
          style={{
            background: hardcore
              ? 'linear-gradient(180deg, rgba(127,29,29,0.55) 0%, rgba(91,14,14,0.55) 100%)'
              : 'linear-gradient(180deg, rgba(40,15,15,0.45) 0%, rgba(25,8,8,0.45) 100%)',
            border: hardcore ? '2px solid var(--sb-crimson-light)' : '1.5px solid rgba(220,38,38,0.4)',
            borderRadius: '4px',
            boxShadow: hardcore ? '0 0 14px rgba(220,38,38,0.45)' : 'var(--sb-shadow-sm)',
          }}
        >
          <input
            type="checkbox"
            checked={hardcore}
            onChange={e => setHardcore(e.target.checked)}
            className="w-4 h-4 accent-red-500 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="sb-display text-[10px]" style={{ color: '#fecaca', letterSpacing: '0.1em' }}>
              ⚠ HARDCORE
            </div>
            <div className="text-[7px] opacity-75" style={{ color: 'var(--sb-parchment)', lineHeight: '1.1' }}>
              Defeat ends run. 1.5× rewards.
            </div>
          </div>
        </label>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="relative z-20 px-3 py-1"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 20%, rgba(15,10,7,0.95) 100%)',
          borderTop: '1px solid var(--sb-bronze-dark)',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.3)',
        }}
      >
        <button onClick={begin} className="sb-btn w-full" style={{ fontSize: '12px', padding: '8px 12px', letterSpacing: '0.15em' }}>
          ⚔ BEGIN ⚔
        </button>
      </div>

      {/* Equipment picker modal */}
      {pickerSlot && (
        <EquipmentPickerModal
          slot={pickerSlot}
          currentlyEquipped={equippedGear[pickerSlot] ?? null}
          availableEquipment={allEq.filter(e => e.slot === pickerSlot)}
          onSelect={(equipDef) => {
            setSlot(pickerSlot, equipDef.id);
            setPickerSlot(null);
          }}
          onUnequip={() => {
            setSlot(pickerSlot, null);
            setPickerSlot(null);
          }}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Talent picker modal */}
      {talentPickerSlot !== null && (
        <TalentPickerModal
          slotNumber={talentPickerSlot}
          currentlyEquipped={equippedTalents[talentPickerSlot] ?? null}
          availableTalents={talents}
          equippedTalentIds={equippedTalents.filter((id): id is string => id !== null && id !== undefined)}
          maxSlots={talentSlotCount}
          onSelect={(talentId) => {
            setEquippedTalents(prev => {
              const next = [...prev];
              while (next.length <= talentPickerSlot) next.push(null);
              next[talentPickerSlot] = talentId;
              while (next.length > 0 && !next[next.length - 1]) next.pop();
              return next;
            });
            setTalentPickerSlot(null);
          }}
          onUnequip={() => {
            setEquippedTalents(prev => {
              const next = [...prev];
              next[talentPickerSlot] = null;
              while (next.length > 0 && !next[next.length - 1]) next.pop();
              return next;
            });
            setTalentPickerSlot(null);
          }}
          onClose={() => setTalentPickerSlot(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function StageHeroPanel({
  stage,
  accent,
  isCurrent,
}: {
  stage: CombatStageDef;
  accent: { bg: string; border: string; glow: string; label: string };
  isCurrent: boolean;
}) {
  const enemies = stage.enemyIds
    .map(id => getEnemy(id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);

  return (
    <div
      className="p-2 mb-1 relative"
      style={{
        background: `linear-gradient(180deg, ${accent.bg} 0%, rgba(0,0,0,0.4) 100%)`,
        border: `2px solid ${accent.border}`,
        borderRadius: '4px',
        boxShadow: `inset 0 1px 0 rgba(255,235,180,0.15), 0 0 14px ${accent.glow}, var(--sb-shadow-md)`,
      }}
    >
      {isCurrent && (
        <div
          className="absolute -top-1.5 -right-1.5 text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full"
          style={{
            background: '#ffd54f',
            color: '#4a2e00',
            border: '2px solid #4a2e00',
            boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
            zIndex: 10,
          }}
        >
          Current
        </div>
      )}

      {/* Stage number and title */}
      <div className="flex items-baseline justify-between gap-1 mb-0.5">
        <div className="sb-display text-2xl flex-1" style={{ color: 'var(--sb-gold-light)' }}>
          {stage.number}
        </div>
        <div className="sb-display text-sm flex-1 truncate text-right" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.05em' }}>
          {stage.isBoss ? '👑 ' : ''}{stage.title}
        </div>
      </div>

      {/* Flavor text */}
      <div className="text-[9px] italic opacity-80 mb-1" style={{ color: 'var(--sb-parchment)' }}>
        "{stage.flavor}"
      </div>

      {/* Stats row */}
      <div className="sb-mono text-[8px] opacity-75 flex flex-wrap gap-x-2 gap-y-0.5 mb-1">
        <span><span className="opacity-60">📊</span> {stage.difficultyBand.toUpperCase()}</span>
        <span><span className="opacity-60">💰</span> {stage.rewardChest.baseGold}g</span>
        {stage.isBoss && <span><span className="opacity-60">👑</span> BOSS</span>}
      </div>

      {/* Enemy cards row */}
      {enemies.length > 0 && (
        <div className="mb-1 py-1" style={{ borderTop: '1px dashed rgba(255,235,180,0.15)', borderBottom: '1px dashed rgba(255,235,180,0.15)' }}>
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
            {enemies.map((enemy, idx) => (
              <div key={idx} style={{ flex: '0 0 auto' }}>
                <EnemyCard enemy={enemy} size="xs" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bonus objectives */}
      {stage.bonusObjectives.length > 0 && (
        <div>
          <div className="sb-display text-[8px] tracking-[0.2em] opacity-60 mb-0.5">✦ OBJECTIVES</div>
          <ul className="space-y-0.5 text-[8px]" style={{ color: 'var(--sb-parchment)' }}>
            {stage.bonusObjectives.map(o => (
              <li key={o.id} className="flex items-baseline gap-1">
                <span style={{ color: 'var(--sb-gold)' }}>◆</span>
                <span className="flex-1 leading-tight">{o.description}</span>
                <span className="sb-mono" style={{ color: 'var(--sb-gold)', fontSize: '7px' }}>+{o.rewardGold}g</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function StageStrip({
  stages,
  selectedStage,
  currentStage,
  onSelectStage,
  biomeAccents,
}: {
  stages: CombatStageDef[];
  selectedStage: number;
  currentStage: number;
  onSelectStage: (stage: number) => void;
  biomeAccents: Record<string, any>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedStage]);

  return (
    <div className="mb-1 py-1">
      <div
        ref={containerRef}
        className="overflow-x-auto -mx-3 px-3"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex gap-1.5" style={{ minWidth: 'min-content' }}>
          {stages.map(s => {
            const locked = s.number > currentStage;
            const selected = s.number === selectedStage;
            const accent = biomeAccents[s.biome] ?? biomeAccents.forest;

            return (
              <button
                ref={selected ? selectedRef : null}
                key={s.number}
                onClick={() => !locked && onSelectStage(s.number)}
                disabled={locked}
                className="sb-display font-bold flex-shrink-0 flex items-center justify-center"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: !locked
                    ? selected
                      ? `linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)`
                      : s.isBoss
                      ? 'linear-gradient(180deg, #7f1d1d 0%, #5b0e0e 100%)'
                      : accent.bg
                    : 'rgba(0,0,0,0.6)',
                  border: `2px solid ${!locked
                    ? selected
                      ? 'var(--sb-gold-light)'
                      : s.isBoss
                      ? accent.border
                      : accent.border
                    : '#2a1f15'
                  }`,
                  color: !locked
                    ? selected
                      ? 'var(--sb-shadow)'
                      : 'var(--sb-gold-light)'
                    : '#3d3027',
                  cursor: locked ? 'not-allowed' : 'pointer',
                  opacity: locked ? 0.45 : 1,
                  fontSize: '12px',
                  boxShadow: selected ? `0 0 10px ${accent.glow}` : undefined,
                }}
                title={locked ? `Stage ${s.number} (locked)` : `${s.title}`}
              >
                {locked ? '🔒' : s.isBoss ? '👑' : s.number}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function EmptyEquipmentSlotCard({ slot }: { slot: EquipmentSlot }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '3/4',
        borderRadius: 4,
        border: '1px dashed rgba(255,235,180,0.15)',
        background: 'rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px',
      }}
    >
      <div className="text-sm opacity-25">◇</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function TalentSlotCard({ talent, slotNumber, selected }: { talent: Perk; slotNumber: number; selected: boolean }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: 4,
        border: `1px solid ${selected ? 'var(--sb-gold-light)' : 'rgba(255,235,180,0.25)'}`,
        background: selected
          ? 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(184,134,11,0.15))'
          : 'rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
        boxShadow: selected ? '0 0 6px rgba(255,215,0,0.2), inset 0 0 4px rgba(255,215,0,0.1)' : undefined,
        transition: 'all 150ms ease',
      }}
    >
      <div className="text-base">{talent.icon}</div>
    </div>
  );
}

function EmptyTalentSlotCard({ slotNumber }: { slotNumber: number }) {
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1',
        borderRadius: 4,
        border: '1px dashed rgba(255,235,180,0.15)',
        background: 'rgba(0,0,0,0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px',
      }}
    >
      <div className="text-xs opacity-25">◇</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function EquipmentPickerModal({
  slot,
  currentlyEquipped,
  availableEquipment,
  onSelect,
  onUnequip,
  onClose,
}: {
  slot: EquipmentSlot;
  currentlyEquipped: EquipmentDef | null;
  availableEquipment: EquipmentDef[];
  onSelect: (eq: EquipmentDef) => void;
  onUnequip: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
          border: '2px solid var(--sb-bronze-dark)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="sb-display text-lg" style={{ color: 'var(--sb-gold-light)' }}>
            {slotLabel(slot)}
          </h2>
          <button
            onClick={onClose}
            className="sb-chip"
            style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {currentlyEquipped && (
          <button
            onClick={onUnequip}
            className="sb-btn w-full mb-4"
            style={{ fontSize: '12px', padding: '10px 16px' }}
          >
            🗑 UNEQUIP
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          {availableEquipment.map(eq => (
            <button
              key={eq.id}
              onClick={() => onSelect(eq)}
              style={{ cursor: 'pointer' }}
            >
              <EquipmentCard equipment={eq} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function TalentPickerModal({
  slotNumber,
  currentlyEquipped,
  availableTalents,
  equippedTalentIds,
  maxSlots,
  onSelect,
  onUnequip,
  onClose,
}: {
  slotNumber: number;
  currentlyEquipped: string | null;
  availableTalents: Perk[];
  equippedTalentIds: string[];
  maxSlots: number;
  onSelect: (talentId: string) => void;
  onUnequip: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-stone-900 rounded-lg p-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
          border: '2px solid var(--sb-bronze-dark)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="sb-display text-lg" style={{ color: 'var(--sb-gold-light)' }}>
            Slot {slotNumber + 1} — Talent
          </h2>
          <button
            onClick={onClose}
            className="sb-chip"
            style={{ padding: '4px 12px', fontSize: '12px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>

        {currentlyEquipped && (
          <button
            onClick={onUnequip}
            className="sb-btn w-full mb-4"
            style={{ fontSize: '12px', padding: '10px 16px' }}
          >
            🗑 UNEQUIP
          </button>
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
                style={{
                  cursor: isOtherSlot ? 'not-allowed' : 'pointer',
                  opacity: isOtherSlot ? 0.5 : 1,
                }}
                title={isOtherSlot ? 'Already equipped in another slot' : ''}
              >
                <TalentCard
                  talent={talent}
                  size="sm"
                  selected={isEquipped}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
