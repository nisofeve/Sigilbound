import { useMemo, useState, useRef, useEffect } from 'react';
import {
  allStages,
  allTalents,
  allEquipment,
  allActions,
  allTactics,
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
import { perkChargesAvailable, isStarterPerk } from '@storage/index';
import type { Profile } from '@storage/index';

interface Props {
  onBegin: (input: {
    stageNumber: number;
    talents: ReadonlyArray<Perk>;
    equipment: EquippedSet;
    hardcore: boolean;
    hardmode?: boolean;
  }) => void;
  onBack: () => void;
  currentStage?: number;
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

// Charge count badge overlaid on a talent card.
// Starter (permanent) perks show "★ ∞"; consumables show "×N".
function TalentChargeBadge({ profile, talentId }: { profile: Profile; talentId: string }) {
  const starter = isStarterPerk(talentId);
  const charges = perkChargesAvailable(profile, talentId);
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 4,
        right: 4,
        background: starter ? '#3a7d44' : charges > 0 ? '#1565c0' : 'rgba(120,80,30,0.7)',
        color: '#fff',
        border: '1.5px solid rgba(255,255,255,0.55)',
        borderRadius: 999,
        fontSize: '0.55rem',
        fontWeight: 800,
        fontFamily: "'Nunito', sans-serif",
        letterSpacing: '0.08em',
        padding: '1px 5px',
        lineHeight: 1.5,
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {starter ? '★ ∞' : `×${charges}`}
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="sb-display" style={{ fontSize: 9, color: 'var(--sb-gold-light)', letterSpacing: '0.25em' }}>
        {title}
      </div>
      <div className="sb-mono" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.85 }}>
        {count}
      </div>
    </div>
  );
}

// Empty-slot placeholder — same portrait shape as GameCard xs, dashed border.
function EmptySlotCard({
  icon, label, onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
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
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color 150ms ease, background 150ms ease',
      }}
    >
      <span style={{ fontSize: 20, opacity: 0.35, lineHeight: 1 }}>{icon}</span>
      <span style={{
        fontSize: '0.5rem', fontFamily: "'Nunito', sans-serif", fontWeight: 800,
        letterSpacing: '0.12em', color: 'rgba(255,235,180,0.25)', textTransform: 'uppercase',
      }}>{label}</span>
    </button>
  );
}

export default function CombatHomeScreen({ onBegin, onBack, currentStage = 100, ownedUpgradeIds = [], profile }: Props) {
  const [selectedStage, setSelectedStage] = useState<number>(currentStage);
  const [equippedTalents, setEquippedTalents] = useState<(string | null)[]>([]);
  const [equippedGear, setEquippedGear] = useState<EquippedSet>(emptyEquippedSet());
  const [hardcore, setHardcore] = useState<boolean>(false);
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

  const stage: CombatStageDef = stages.find(s => s.number === selectedStage) ?? stages[0];
  const stageAccent = BIOME_ACCENTS[stage.biome] ?? BIOME_ACCENTS.forest;
  const equippedSlots = (Object.keys(equippedGear) as EquipmentSlot[]).filter(s => !!equippedGear[s]);

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

  const equippedTalentCount = equippedTalents.filter((id): id is string => id !== null).length;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom overflow-hidden">

      {/* ── TOP BAR ── */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-1.5 flex-shrink-0">
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px', minHeight: 32 }}>
          ← HOME
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          ⚔ COMBAT
        </div>
        <div style={{ width: 64 }} />
      </div>

      {/* ── HERO PANEL — compact ── */}
      <div className="relative z-10 px-3 flex-shrink-0">
        <StageHeroPanel
          stage={stage}
          accent={stageAccent}
          isCurrent={selectedStage === currentStage}
        />
      </div>

      {/* ── STAGE STRIP — single row pager ── */}
      <div className="relative z-10 flex-shrink-0">
        <StageStrip
          stages={stages}
          selectedStage={selectedStage}
          currentStage={currentStage}
          onSelectStage={setSelectedStage}
          biomeAccents={BIOME_ACCENTS}
        />
      </div>

      {/* ── LOADOUT (talents + equipment) — card rails ── */}
      <div className="relative z-10 flex-1 min-h-0 px-3 flex flex-col gap-2 justify-center">

        {/* Talents row */}
        <SectionHeader title="✦ TALENTS" count={`${equippedTalentCount}/${talentSlotCount}`} />
        <div
          style={{
            display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
            scrollbarWidth: 'none',
          }}
        >
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
              <EmptySlotCard
                key={slotIdx}
                icon="◇"
                label={`SLOT ${slotIdx + 1}`}
                onClick={() => setTalentPickerSlot(slotIdx)}
              />
            );
          })}
        </div>

        {/* Equipment row */}
        <SectionHeader title="✦ EQUIPMENT" count={`${equippedSlots.length}/6`} />
        <div
          style={{
            display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
            scrollbarWidth: 'none',
          }}
        >
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
              <EmptySlotCard
                key={slot}
                icon={slotEmoji(slot)}
                label={slotLabel(slot).replace(/^[^\s]+\s/, '')}
                onClick={() => setPickerSlot(slot)}
              />
            );
          })}
        </div>

        {/* Hardcore — compact chip-style toggle */}
        <button
          onClick={() => setHardcore(h => !h)}
          className="flex items-center gap-2 mt-1 px-2.5 py-1.5 self-center"
          style={{
            background: hardcore
              ? 'linear-gradient(180deg, rgba(185,28,28,0.7) 0%, rgba(91,14,14,0.7) 100%)'
              : 'linear-gradient(180deg, rgba(40,15,15,0.45) 0%, rgba(25,8,8,0.45) 100%)',
            border: hardcore ? '2px solid var(--sb-crimson-light)' : '1.5px solid rgba(220,38,38,0.35)',
            borderRadius: 999,
            cursor: 'pointer',
            boxShadow: hardcore ? '0 0 14px rgba(220,38,38,0.45)' : 'var(--sb-shadow-sm)',
            minHeight: 30,
          }}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 3,
            background: hardcore ? 'var(--sb-crimson-light)' : 'transparent',
            border: '1.5px solid #fecaca',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#fff', lineHeight: 1, flexShrink: 0,
          }}>
            {hardcore ? '✓' : ''}
          </span>
          <span className="sb-display" style={{ fontSize: 10, color: '#fecaca', letterSpacing: '0.18em' }}>
            ⚠ HARDCORE · 1.5× REWARDS
          </span>
        </button>
      </div>

      {/* ── BEGIN BUTTON — heraldic crimson CTA matching hub style ── */}
      <div
        className="relative z-20 flex-shrink-0 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(15,10,7,0.85) 25%, rgba(15,10,7,0.95) 100%)',
          borderTop: '1px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.5)',
        }}
      >
        {/* Deck HUD — inline compact strip */}
        <CombatDeckStrip deck={profile.combatDeck} />
        <button
          onClick={begin}
          className="sb-btn sb-pulse-crimson w-full"
          style={{ fontSize: '15px', padding: '14px 18px', letterSpacing: '0.2em' }}
        >
          <span className="flex flex-col items-center leading-tight">
            <span>⚔  BEGIN STAGE {selectedStage}  ⚔</span>
            <span className="sb-mono mt-0.5 opacity-80" style={{ fontSize: '9px', letterSpacing: '0.3em' }}>
              {equippedTalentCount} TALENT{equippedTalentCount === 1 ? '' : 'S'} · {equippedSlots.length}/6 GEAR{hardcore ? ' · HARDCORE' : ''}
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
          onSelect={(equipDef) => {
            setSlot(pickerSlot, equipDef.id);
            setPickerSlot(null);
          }}
          onUnequip={() => {
            setSlot(pickerSlot, null);
            setPickerSlot(null);
          }}
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
          equippedTalentIds={equippedTalents.filter((id): id is string => id !== null && id !== undefined)}
          maxSlots={talentSlotCount}
          profile={profile}
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
          onLongPress={(perk) => startDetailLongPress({ kind: 'talent', perk })}
          onLongPressCancel={cancelDetailLongPress}
        />
      )}

      {/* Card detail modal — long-press on equipment or talent cards */}
      {detailTarget && (
        <CardDetailModal
          target={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

/* ─── Compact deck strip for the begin-button area ──────────────────────── */

const RARITY_PIPS_CM: Array<{ key: string; color: string }> = [
  { key: 'common',    color: '#94a3b8' },
  { key: 'uncommon',  color: '#4ade80' },
  { key: 'rare',      color: '#60a5fa' },
  { key: 'epic',      color: '#c084fc' },
  { key: 'legendary', color: '#fbbf24' },
  { key: 'mythic',    color: '#f87171' },
];

function CombatDeckStrip({ deck }: { deck: string[] }) {
  const allCardDefs = useMemo(() => {
    const actions = allActions();
    const tactics = allTactics();
    return new Map([...actions, ...tactics].map(c => [c.id, c]));
  }, []);

  const cards = deck.map(id => allCardDefs.get(id)).filter(Boolean) as Array<{ id: string; type: string; rarity: string; emoji?: string }>;
  const totalCards = cards.length;
  const actions = cards.filter(c => c.type === 'action').length;
  const tactics = cards.filter(c => c.type === 'tactic').length;
  const rarityCounts = cards.reduce<Record<string, number>>((acc, c) => {
    acc[c.rarity] = (acc[c.rarity] ?? 0) + 1;
    return acc;
  }, {});
  const previewEmojis = [...new Map(cards.filter(c => c.emoji).map(c => [c.id, c.emoji])).values()].slice(0, 6) as string[];

  return (
    <div
      className="mb-2"
      style={{
        background: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255,235,180,0.1)',
        borderRadius: 8,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span className="sb-display" style={{ fontSize: 8, color: 'var(--sb-gold)', letterSpacing: '0.18em', flexShrink: 0 }}>
        🃏 DECK
      </span>
      <div style={{ width: 1, height: 14, background: 'rgba(255,235,180,0.12)', flexShrink: 0 }} />
      {totalCards === 0 ? (
        <span className="sb-display" style={{ fontSize: 8, color: 'rgba(255,235,180,0.25)', letterSpacing: '0.1em' }}>
          NO DECK — DEFAULT LOADOUT USED
        </span>
      ) : (
        <>
          {/* Emoji previews */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flex: 1, minWidth: 0 }}>
            {previewEmojis.map((em, i) => (
              <span key={i} style={{ fontSize: 13, lineHeight: 1, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}>{em}</span>
            ))}
            {totalCards > previewEmojis.length && (
              <span className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.35)' }}>+{totalCards - previewEmojis.length}</span>
            )}
          </div>
          {/* Rarity pips */}
          <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
            {RARITY_PIPS_CM.filter(r => rarityCounts[r.key]).map(r => (
              <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: r.color, boxShadow: `0 0 3px ${r.color}80` }} />
                <span className="sb-mono" style={{ fontSize: 7, color: r.color, opacity: 0.8 }}>{rarityCounts[r.key]}</span>
              </div>
            ))}
          </div>
          {/* Type split */}
          <div style={{ width: 1, height: 14, background: 'rgba(255,235,180,0.12)', flexShrink: 0 }} />
          <span className="sb-mono" style={{ fontSize: 8, color: 'rgba(255,235,180,0.5)', flexShrink: 0 }}>
            {totalCards} · ⚔{actions} ✦{tactics}
          </span>
        </>
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
      className="px-2 py-1.5 mb-1 relative"
      style={{
        background: `linear-gradient(180deg, ${accent.bg} 0%, rgba(0,0,0,0.45) 100%)`,
        border: `2px solid ${accent.border}`,
        borderRadius: 4,
        boxShadow: `inset 0 1px 0 rgba(255,235,180,0.18), 0 0 12px ${accent.glow}, var(--sb-shadow-md)`,
      }}
    >
      {isCurrent && (
        <div
          className="absolute -top-1.5 -right-1.5 text-[9px] uppercase tracking-widest font-extrabold px-1.5 py-0.5 rounded-full"
          style={{
            background: '#ffd54f', color: '#4a2e00',
            border: '2px solid #4a2e00',
            boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
            zIndex: 10,
          }}
        >
          Current
        </div>
      )}

      {/* Title row + stats inline */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-baseline gap-2 min-w-0 flex-1">
          <div className="sb-display flex-shrink-0" style={{ fontSize: 22, color: 'var(--sb-gold-light)', lineHeight: 1 }}>
            {stage.number}
          </div>
          <div className="sb-display truncate" style={{ fontSize: 13, color: 'var(--sb-gold-light)', letterSpacing: '0.05em' }}>
            {stage.isBoss ? '👑 ' : ''}{stage.title}
          </div>
        </div>
        <div className="sb-mono flex items-center gap-1.5 flex-shrink-0" style={{ fontSize: 9, color: 'var(--sb-gold)', opacity: 0.85 }}>
          <span>📊 {stage.difficultyBand.slice(0, 3).toUpperCase()}</span>
          <span>💰 {stage.rewardChest.baseGold}g</span>
        </div>
      </div>

      {/* Enemy strip — small horizontal cards */}
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
    <div className="px-3 py-1">
      <div
        ref={containerRef}
        className="overflow-x-auto -mx-3 px-3"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex gap-1.5 items-center" style={{ minWidth: 'min-content' }}>
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
                  width: selected ? 38 : 32,
                  height: selected ? 38 : 32,
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
                  fontSize: selected ? 13 : 11,
                  transition: 'all 180ms ease',
                  boxShadow: selected ? `0 0 12px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.3)` : undefined,
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

/* ─────────────────────────────────────────────────────────────────────────── */

function EquipmentPickerModal({
  slot,
  currentlyEquipped,
  availableEquipment,
  onSelect,
  onUnequip,
  onClose,
  onLongPress,
  onLongPressCancel,
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

/* ─────────────────────────────────────────────────────────────────────────── */

function TalentPickerModal({
  slotNumber,
  currentlyEquipped,
  availableTalents,
  equippedTalentIds,
  maxSlots: _,
  profile,
  onSelect,
  onUnequip,
  onClose,
  onLongPress,
  onLongPressCancel,
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
                onPointerDown={() => onLongPress(talent)}
                onPointerUp={onLongPressCancel}
                onPointerLeave={onLongPressCancel}
                onPointerCancel={onLongPressCancel}
                style={{
                  cursor: isOtherSlot ? 'not-allowed' : 'pointer',
                  opacity: isOtherSlot ? 0.5 : 1,
                  touchAction: 'none',
                  userSelect: 'none',
                  position: 'relative',
                }}
                title={isOtherSlot ? 'Already equipped in another slot' : ''}
              >
                <TalentCard
                  talent={talent}
                  size="sm"
                  selected={isEquipped}
                />
                <TalentChargeBadge profile={profile} talentId={talent.id} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
