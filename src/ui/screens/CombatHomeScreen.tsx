// Sigilbound combat home — pre-battle screen.
//
// Mobile-first portrait layout:
//   ┌────────────────────────────────────┐
//   │ ← Home │ ⚔ STAGES │ page nav      │  ← top bar
//   ├────────────────────────────────────┤
//   │ stage 1   2   3 …                  │  ← scrollable stage grid
//   │   …                                │
//   ├────────────────────────────────────┤
//   │ Selected stage hero panel          │  ← biome-tinted parchment
//   │ enemies · difficulty · objectives  │
//   ├────────────────────────────────────┤
//   │ [ TALENTS  N/2 ▸ ]                 │  ← collapsible (tap to expand)
//   │ [ EQUIPMENT     ▸ ]                │
//   │ [ ⚠ HARDCORE ◯ ]                   │
//   ├────────────────────────────────────┤
//   │     ⚔ BEGIN BATTLE ⚔               │  ← sticky bottom CTA
//   └────────────────────────────────────┘

import { useMemo, useState } from 'react';
import {
  allStages,
  allTalents,
  allEquipment,
  emptyEquippedSet,
  equip,
  type CombatStageDef,
  type EquippedSet,
  type Perk,
  type EquipmentSlot,
} from '@engine/index';

interface Props {
  onBegin: (input: {
    stageNumber: number;
    talents: ReadonlyArray<Perk>;
    equipment: EquippedSet;
    hardcore: boolean;
  }) => void;
  onBack: () => void;
  currentStage?: number;
}

const STAGES_PER_PAGE = 20;

const BIOME_ACCENTS: Record<string, { bg: string; border: string; glow: string; label: string }> = {
  forest:    { bg: 'rgba(34,89,46,0.3)',   border: '#4ade80', glow: 'rgba(74,222,128,0.4)',  label: 'Whispering Forest' },
  crypts:    { bg: 'rgba(67,40,80,0.35)',  border: '#a78bfa', glow: 'rgba(167,139,250,0.4)', label: 'Sunken Crypts' },
  frostpeak: { bg: 'rgba(30,64,100,0.35)', border: '#93c5fd', glow: 'rgba(147,197,253,0.45)',label: 'Frostpeak Hollows' },
  volcano:   { bg: 'rgba(120,28,12,0.4)',  border: '#f97316', glow: 'rgba(249,115,22,0.45)', label: 'Volcanic Forge' },
  ashen:     { bg: 'rgba(80,15,40,0.5)',   border: '#ec4899', glow: 'rgba(236,72,153,0.5)',  label: 'Ashen Citadel' },
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

type Section = 'talents' | 'equipment' | null;

export default function CombatHomeScreen({ onBegin, onBack, currentStage = 100 }: Props) {
  const [selectedStage, setSelectedStage] = useState<number>(1);
  const [equippedTalents, setEquippedTalents] = useState<string[]>([]);
  const [equippedGear, setEquippedGear] = useState<EquippedSet>(emptyEquippedSet());
  const [page, setPage] = useState<number>(0);
  const [hardcore, setHardcore] = useState<boolean>(false);
  const [openSection, setOpenSection] = useState<Section>(null);

  const stages = useMemo(() => allStages(), []);
  const pageCount = Math.ceil(stages.length / STAGES_PER_PAGE);
  const visibleStages = useMemo(
    () => stages.slice(page * STAGES_PER_PAGE, (page + 1) * STAGES_PER_PAGE),
    [stages, page],
  );

  const talents = useMemo(() => allTalents(), []);
  const allEq = useMemo(() => allEquipment(), []);

  function toggleTalent(id: string) {
    setEquippedTalents(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 2) return [prev[1], id];
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

  const stage: CombatStageDef = stages.find(s => s.number === selectedStage) ?? stages[0];
  const stageAccent = BIOME_ACCENTS[stage.biome] ?? BIOME_ACCENTS.forest;
  const equippedSlots = (Object.keys(equippedGear) as EquipmentSlot[]).filter(s => !!equippedGear[s]);

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
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-3 sb-fade-up">

        {/* Stage map (compact) */}
        <div className="flex items-center justify-between mb-1.5 mt-1">
          <div className="sb-mono text-[10px]" style={{ color: 'var(--sb-gold-light)' }}>
            STAGES {page * STAGES_PER_PAGE + 1}–{Math.min((page + 1) * STAGES_PER_PAGE, stages.length)}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="sb-chip"
              style={{ cursor: page === 0 ? 'not-allowed' : 'pointer', padding: '3px 9px', fontSize: '10px', opacity: page === 0 ? 0.3 : 1 }}
            >‹</button>
            <span className="sb-mono text-[9px] opacity-60 px-1">{page + 1}/{pageCount}</span>
            <button
              onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
              disabled={page >= pageCount - 1}
              className="sb-chip"
              style={{ cursor: page >= pageCount - 1 ? 'not-allowed' : 'pointer', padding: '3px 9px', fontSize: '10px', opacity: page >= pageCount - 1 ? 0.3 : 1 }}
            >›</button>
          </div>
        </div>
        <div
          className="grid grid-cols-5 gap-1.5 p-2 mb-3"
          style={{
            background: 'rgba(0,0,0,0.3)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: '4px',
            boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.1)',
          }}
        >
          {visibleStages.map(s => {
            const locked = s.number > currentStage;
            const selected = s.number === selectedStage;
            const accent = BIOME_ACCENTS[s.biome] ?? BIOME_ACCENTS.forest;
            const cellStyle: React.CSSProperties = locked
              ? { background: 'rgba(0,0,0,0.6)', color: '#3d3027', border: '1.5px solid #2a1f15', cursor: 'not-allowed' }
              : selected
              ? {
                  background: 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)',
                  color: 'var(--sb-shadow)',
                  border: '2px solid var(--sb-gold-light)',
                  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.4), 0 0 10px ${accent.glow}`,
                }
              : s.isBoss
              ? {
                  background: 'linear-gradient(180deg, #7f1d1d 0%, #5b0e0e 100%)',
                  color: 'var(--sb-gold-light)',
                  border: `2px solid ${accent.border}`,
                  cursor: 'pointer',
                }
              : {
                  background: accent.bg,
                  color: 'var(--sb-gold-light)',
                  border: `1.5px solid ${accent.border}`,
                  cursor: 'pointer',
                };
            return (
              <button
                key={s.number}
                onClick={() => !locked && setSelectedStage(s.number)}
                disabled={locked}
                className="sb-display aspect-square text-[12px] font-bold flex items-center justify-center"
                style={{ ...cellStyle, borderRadius: '3px', textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}
                title={locked ? `Stage ${s.number} (locked)` : `${s.title} · ${accent.label}`}
              >
                {locked ? '🔒' : s.isBoss ? <span className="flex flex-col leading-none gap-0.5"><span style={{ fontSize: '9px' }}>👑</span><span>{s.number}</span></span> : s.number}
              </button>
            );
          })}
        </div>

        {/* Selected stage hero panel */}
        <div
          className="p-3 mb-3"
          style={{
            background: `linear-gradient(180deg, ${stageAccent.bg} 0%, rgba(0,0,0,0.4) 100%)`,
            border: `2px solid ${stageAccent.border}`,
            borderRadius: '4px',
            boxShadow: `inset 0 1px 0 rgba(255,235,180,0.15), 0 0 14px ${stageAccent.glow}, var(--sb-shadow-md)`,
          }}
        >
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div className="sb-display text-base flex-1 truncate" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.05em' }}>
              {stage.isBoss ? '👑 ' : ''}{stage.title}
            </div>
            <div className="sb-mono text-[9px] opacity-70 uppercase tracking-widest flex-shrink-0">
              {stageAccent.label}
            </div>
          </div>
          <div className="text-[11px] italic opacity-90 mb-2" style={{ color: 'var(--sb-parchment)' }}>
            "{stage.flavor}"
          </div>
          <div className="sb-mono text-[10px] opacity-80 flex flex-wrap gap-x-3 gap-y-0.5">
            <span><span className="opacity-60">⚔</span> {stage.enemyIds.length} enemies</span>
            <span><span className="opacity-60">·</span> {stage.difficultyBand.toUpperCase()}</span>
            <span><span className="opacity-60">·</span> 💰 {stage.rewardChest.baseGold}</span>
          </div>
          {stage.bonusObjectives.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px dashed rgba(255,235,180,0.18)' }}>
              <div className="sb-display text-[9px] tracking-[0.25em] opacity-65 mb-1">✦ OBJECTIVES</div>
              <ul className="space-y-0.5 text-[10px]" style={{ color: 'var(--sb-parchment)' }}>
                {stage.bonusObjectives.map(o => (
                  <li key={o.id} className="flex items-baseline gap-1.5">
                    <span style={{ color: 'var(--sb-gold)' }}>◆</span>
                    <span className="flex-1 leading-tight">{o.description}</span>
                    <span className="sb-mono" style={{ color: 'var(--sb-gold)', fontSize: '9px' }}>+{o.rewardGold}g</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Loadout sections (collapsible) */}
        <CollapsibleSection
          title="TALENTS"
          summary={`${equippedTalents.length}/2`}
          isOpen={openSection === 'talents'}
          onToggle={() => setOpenSection(openSection === 'talents' ? null : 'talents')}
        >
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {talents.slice(0, 8).map(t => {
              const isEquipped = equippedTalents.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleTalent(t.id)}
                  className={`sb-rarity-${t.rarity} text-left p-2 transition-all`}
                  style={{
                    background: isEquipped
                      ? 'linear-gradient(180deg, var(--sb-gold) 0%, var(--sb-bronze) 100%)'
                      : 'linear-gradient(180deg, var(--sb-parchment) 0%, var(--sb-parchment-dark) 100%)',
                    border: '2px solid var(--sb-parchment-edge)',
                    borderRadius: '3px',
                    color: isEquipped ? 'var(--sb-shadow)' : '#2c1810',
                    cursor: 'pointer',
                    boxShadow: isEquipped
                      ? 'inset 0 0 0 1.5px rgba(255,255,255,0.4), 0 0 10px rgba(251,191,36,0.5)'
                      : 'inset 0 0 0 1px rgba(255,235,180,0.35), 0 1px 4px rgba(0,0,0,0.45)',
                  }}
                >
                  <div className="sb-display font-bold text-[11px] flex items-center gap-1">
                    <span className="text-sm">{t.icon}</span>
                    <span className="truncate">{t.name}</span>
                  </div>
                  <div className="text-[9px] opacity-80 mt-0.5 line-clamp-2 leading-snug">{t.description}</div>
                </button>
              );
            })}
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="EQUIPMENT"
          summary={`${equippedSlots.length}/6`}
          isOpen={openSection === 'equipment'}
          onToggle={() => setOpenSection(openSection === 'equipment' ? null : 'equipment')}
        >
          <div className="grid grid-cols-2 gap-1.5 p-2">
            {(['weapon', 'offhand', 'helm', 'armor', 'ring', 'amulet'] as EquipmentSlot[]).map(slot => {
              const equipped = equippedGear[slot];
              const options = allEq.filter(e => e.slot === slot);
              return (
                <div
                  key={slot}
                  className={equipped ? `sb-rarity-${equipped.rarity}` : ''}
                  style={{
                    background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
                    border: '2px solid var(--sb-bronze-dark)',
                    borderRadius: '3px',
                    padding: '6px 8px',
                  }}
                >
                  <div className="sb-display text-[8px] tracking-[0.22em] opacity-65" style={{ color: 'var(--sb-gold)' }}>
                    {slotLabel(slot).toUpperCase()}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-base flex-shrink-0">{equipped?.icon ?? '◇'}</span>
                    <select
                      value={equipped?.id ?? ''}
                      onChange={e => setSlot(slot, e.target.value || null)}
                      className="sb-mono flex-1 min-w-0 text-[10px] px-1.5 py-0.5"
                      style={{
                        background: 'rgba(0,0,0,0.5)',
                        color: 'var(--sb-gold-light)',
                        border: '1px solid var(--sb-bronze-dark)',
                        borderRadius: '2px',
                        outline: 'none',
                      }}
                    >
                      <option value="">— empty —</option>
                      {options.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {RARITY_LABEL[o.rarity]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>

        {/* Hardcore toggle */}
        <label
          className="flex items-center gap-2 mb-3 p-2.5 cursor-pointer select-none"
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
            <div className="sb-display text-[12px]" style={{ color: '#fecaca', letterSpacing: '0.15em' }}>
              ⚠ HARDCORE
            </div>
            <div className="text-[9px] opacity-80" style={{ color: 'var(--sb-parchment)' }}>
              HP carries the arc. Defeat voids the run.
              <span className="font-bold ml-1" style={{ color: 'var(--sb-gold)' }}>1.5× rewards.</span>
            </div>
          </div>
        </label>
      </div>

      {/* Sticky bottom CTA */}
      <div
        className="relative z-20 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <button onClick={begin} className="sb-btn w-full" style={{ fontSize: '15px', padding: '14px 20px', letterSpacing: '0.18em' }}>
          ⚔ BEGIN BATTLE ⚔
        </button>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title, summary, isOpen, onToggle, children,
}: {
  title: string;
  summary: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mb-2"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1.5px solid var(--sb-bronze-dark)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2"
        style={{
          background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
          color: 'var(--sb-gold-light)',
          cursor: 'pointer',
          borderBottom: isOpen ? '1px solid var(--sb-bronze-dark)' : 'none',
        }}
      >
        <span className="sb-display text-[11px]" style={{ letterSpacing: '0.25em' }}>
          ✦ {title}
        </span>
        <span className="flex items-center gap-2">
          <span className="sb-mono text-[10px] opacity-70">{summary}</span>
          <span style={{ transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▸</span>
        </span>
      </button>
      {isOpen && <div className="sb-fade-up">{children}</div>}
    </div>
  );
}

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
