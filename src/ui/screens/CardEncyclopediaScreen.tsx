// Card Encyclopedia — lists all battle cards, equipment, talents, and lore.
// Mirrors the BestiaryScreen pattern: filter tabs + card grid + detail modal.

import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  allActions,
  allTactics,
  allEquipment,
  allTalents,
  type ActionCardDef,
  type TacticCardDef,
  type EquipmentDef,
  type Perk,
} from '@engine/index';
import { allLoreMilestones, loreUnlockedForStage, type LoreMilestone } from '@engine/lore';
import type { Profile } from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { TalentCard } from '@ui/components/TalentCard';
import { CardDetailModal } from '@ui/components/CardDetailBody';
import { IMAGE_MANIFEST } from '@ui/components/imageManifest';
import { EnemyCard } from '@ui/components/EnemyCard';
import type { EnemyDef } from '@engine/enemy';
import enemiesJson from '@data/enemies.json';

type EncTab = 'battle' | 'equipment' | 'talent' | 'lore' | 'bestiary';
type BattleFilter = 'all' | 'action' | 'tactic';
type EquipFilter = 'all' | string; // slot name
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const ALL_ENEMIES = enemiesJson as EnemyDef[];
const BIOME_LABEL: Record<string, string> = {
  forest:   '🌲 Forest',
  crypts:   '💀 Crypts',
  frostpeak:'❄️ Frostpeak',
  volcano:  '🌋 Volcano',
  ashen:    '🔥 Ashen Wastes',
};
const BIOME_ORDER = ['forest', 'crypts', 'frostpeak', 'volcano', 'ashen'];
const DAMAGE_TYPE_COLOR: Record<string, string> = {
  physical: '#cbd5e1', fire: '#fca5a5', ice: '#93c5fd',
  dark: '#c4b5fd', nature: '#86efac', holy: '#fde68a', thunder: '#fcd34d',
};

interface Props {
  profile: Profile;
  onBack: () => void;
  initialTab?: EncTab;
}

type DetailTarget =
  | { kind: 'battle'; card: ActionCardDef | TacticCardDef }
  | { kind: 'equipment'; eq: EquipmentDef }
  | { kind: 'talent'; perk: Perk };

export default function CardEncyclopediaScreen({ profile, onBack, initialTab = 'battle' }: Props) {
  const [tab, setTab] = useState<EncTab>(initialTab);
  const [battleFilter, setBattleFilter] = useState<BattleFilter>('all');
  const [equipFilter, setEquipFilter] = useState<EquipFilter>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [loreDetail, setLoreDetail] = useState<{ milestone: LoreMilestone; loreNumber: number } | null>(null);

  const allActs = useMemo(() => allActions(), []);
  const allTacs = useMemo(() => allTactics(), []);
  const allEqs = useMemo(() => allEquipment(), []);
  const allTals = useMemo(() => allTalents(), []);
  const allLore = useMemo(() => allLoreMilestones(), []);
  const unlockedStages = profile.loreMilestonesUnlocked ?? [];
  const [bestiaryFilter, setBestiaryFilter] = useState<string>('all');
  const [selectedEnemy, setSelectedEnemy] = useState<EnemyDef | null>(null);

  const availableBiomes = useMemo(() =>
    BIOME_ORDER.filter(b => ALL_ENEMIES.some(e => e.biome === b)), []);

  const bestiaryGrouped = useMemo(() => {
    const filtered = bestiaryFilter === 'all'
      ? ALL_ENEMIES
      : ALL_ENEMIES.filter(e => e.biome === bestiaryFilter);
    const map = new Map<string, EnemyDef[]>();
    for (const e of filtered) {
      const b = e.biome ?? 'unknown';
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(e);
    }
    return BIOME_ORDER.filter(b => map.has(b)).map(b => ({ biome: b, enemies: map.get(b)! }));
  }, [bestiaryFilter]);

  const battleCards = useMemo(() => {
    const base =
      battleFilter === 'action' ? allActs :
      battleFilter === 'tactic' ? allTacs :
      [...allActs, ...allTacs];
    const q = search.toLowerCase();
    return base
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ra = RARITY_ORDER.indexOf(a.rarity);
        const rb = RARITY_ORDER.indexOf(b.rarity);
        return rb !== ra ? rb - ra : a.name.localeCompare(b.name);
      });
  }, [allActs, allTacs, battleFilter, search]);

  const equipCards = useMemo(() => {
    const q = search.toLowerCase();
    return allEqs
      .filter(e => equipFilter === 'all' || e.slot === equipFilter)
      .filter(e => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ra = RARITY_ORDER.indexOf(a.rarity);
        const rb = RARITY_ORDER.indexOf(b.rarity);
        return rb !== ra ? rb - ra : a.name.localeCompare(b.name);
      });
  }, [allEqs, equipFilter, search]);

  const talentCards = useMemo(() => {
    const q = search.toLowerCase();
    return allTals
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const ra = RARITY_ORDER.indexOf(a.rarity);
        const rb = RARITY_ORDER.indexOf(b.rarity);
        return rb !== ra ? rb - ra : a.name.localeCompare(b.name);
      });
  }, [allTals, search]);

  const equipSlots = useMemo(() => {
    const slots = new Set(allEqs.map(e => e.slot));
    return ['all', ...Array.from(slots).sort()];
  }, [allEqs]);

  return (
    <div
      className="safe-top safe-bottom"
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(160deg, #0c0a15 0%, #080610 60%, #0c100c 100%)',
        color: '#e2e8f0', overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,235,180,0.08)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: 8, color: 'var(--sb-gold-light)',
            padding: '6px 12px', cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem',
            fontWeight: 800, letterSpacing: '0.08em',
          }}
        >
          ← HOME
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div className="sb-display" style={{ fontSize: '1.1rem', color: 'var(--sb-gold-light)', letterSpacing: '0.25em' }}>
            📚 CARD ENCYCLOPEDIA
          </div>
        </div>
        <div className="sb-mono" style={{ fontSize: '0.7rem', color: 'var(--sb-gold)', opacity: 0.6, minWidth: 52, textAlign: 'right' }}>
          {tab === 'battle' ? `${battleCards.length} entries` :
           tab === 'equipment' ? `${equipCards.length} entries` :
           tab === 'talent' ? `${talentCards.length} entries` :
           tab === 'bestiary' ? `${ALL_ENEMIES.length} enemies` :
           `${unlockedStages.length} / ${allLore.length}`}
        </div>
      </div>

      {/* Tab row */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {(['battle', 'equipment', 'talent', 'lore', 'bestiary'] as EncTab[]).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(''); }}
            style={{
              padding: '6px 14px', borderRadius: '8px 8px 0 0',
              fontSize: '0.72rem', fontWeight: 800, fontFamily: "'Nunito', sans-serif",
              letterSpacing: '0.08em', cursor: 'pointer', border: 'none',
              background: tab === t ? 'rgba(196,146,42,0.18)' : 'transparent',
              borderBottom: tab === t ? '2px solid var(--sb-gold)' : '2px solid transparent',
              color: tab === t ? 'var(--sb-gold-light)' : '#8d6e3f',
            }}
          >
            {t === 'battle' ? '⚔ Battle Cards' :
             t === 'equipment' ? '🛡 Equipment' :
             t === 'talent' ? '💎 Talents' :
             t === 'bestiary' ? '👾 Bestiary' :
             '📜 Lore Journal'}
          </button>
        ))}
      </div>

      {/* Search + filter bar — hidden on lore tab (small fixed dataset). */}
      {tab !== 'lore' && tab !== 'bestiary' && (
      <div style={{ display: 'flex', gap: 8, padding: '8px 16px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, minWidth: 120, padding: '5px 10px',
            borderRadius: 8, fontSize: '0.78rem', fontFamily: "'Nunito', sans-serif",
            background: 'rgba(0,0,0,0.35)', border: '1.5px solid rgba(255,255,255,0.1)',
            color: '#e2e8f0', outline: 'none',
          }}
        />
        {tab === 'battle' && (
          <div style={{ display: 'flex', gap: 5 }}>
            {(['all', 'action', 'tactic'] as BattleFilter[]).map(f => (
              <FilterPill
                key={f}
                active={battleFilter === f}
                onClick={() => setBattleFilter(f)}
                label={f === 'all' ? 'All' : f === 'action' ? '⚔ Actions' : '✦ Tactics'}
              />
            ))}
          </div>
        )}
        {tab === 'equipment' && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {equipSlots.map(s => (
              <FilterPill
                key={s}
                active={equipFilter === s}
                onClick={() => setEquipFilter(s)}
                label={s === 'all' ? 'All' : s}
              />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Card grid */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 16px 16px',
        scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent',
      }}>
        {tab === 'battle' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {battleCards.map(card => (
              <div
                key={card.id}
                onClick={() => setDetail({ kind: 'battle', card })}
                style={{ cursor: 'pointer' }}
              >
                <CombatCard card={card} size="sm" />
              </div>
            ))}
            {battleCards.length === 0 && <EmptyState />}
          </div>
        )}
        {tab === 'equipment' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {equipCards.map(eq => (
              <div
                key={eq.id}
                onClick={() => setDetail({ kind: 'equipment', eq })}
                style={{ cursor: 'pointer' }}
              >
                <EquipmentCard equipment={eq} />
              </div>
            ))}
            {equipCards.length === 0 && <EmptyState />}
          </div>
        )}
        {tab === 'talent' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {talentCards.map(tal => (
              <div
                key={tal.id}
                onClick={() => setDetail({ kind: 'talent', perk: tal })}
                style={{ cursor: 'pointer' }}
              >
                <TalentCard talent={tal} />
              </div>
            ))}
            {talentCards.length === 0 && <EmptyState />}
          </div>
        )}
        {tab === 'lore' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {allLore.map((m, i) => {
              const unlocked = loreUnlockedForStage(m.stage, unlockedStages);
              const loreNumber = i + 1;
              return (
                <LoreCardThumb
                  key={m.stage}
                  milestone={m}
                  loreNumber={loreNumber}
                  unlocked={unlocked}
                  onClick={() => unlocked && setLoreDetail({ milestone: m, loreNumber })}
                />
              );
            })}
          </div>
        )}
        {tab === 'bestiary' && (
          <div>
            {/* Biome filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {['all', ...availableBiomes].map(b => (
                <button
                  key={b}
                  onClick={() => setBestiaryFilter(b)}
                  style={{
                    flexShrink: 0,
                    background: bestiaryFilter === b ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${bestiaryFilter === b ? '#fb923c' : 'rgba(255,255,255,0.1)'}`,
                    borderRadius: 20,
                    color: bestiaryFilter === b ? '#fb923c' : '#64748b',
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontFamily: "'Nunito', sans-serif",
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {b === 'all' ? '⚔ ALL' : BIOME_LABEL[b] ?? b.toUpperCase()}
                </button>
              ))}
            </div>
            {/* Enemy groups */}
            {bestiaryGrouped.map(({ biome, enemies }) => (
              <div key={biome} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontFamily: "'Fredoka One', cursive", fontSize: '0.9rem', color: '#94a3b8', letterSpacing: '0.05em' }}>
                    {BIOME_LABEL[biome] ?? biome}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
                  <span style={{ fontFamily: "'Nunito', sans-serif", fontSize: '0.65rem', fontWeight: 700, color: '#334155', letterSpacing: '0.1em' }}>
                    {enemies.length}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {enemies.map(e => (
                    <EnemyCard key={e.id} enemy={e} size="md" onClick={() => setSelectedEnemy(e)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && <CardDetailModal target={detail} onClose={() => setDetail(null)} />}
      {loreDetail && (
        <LoreDetailModal
          milestone={loreDetail.milestone}
          loreNumber={loreDetail.loreNumber}
          onClose={() => setLoreDetail(null)}
        />
      )}
      {selectedEnemy && (
        <EnemyDetailPopover enemy={selectedEnemy} onClose={() => setSelectedEnemy(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FilterPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 10px', borderRadius: 99,
        fontSize: '0.65rem', fontWeight: 800, fontFamily: "'Nunito', sans-serif",
        cursor: 'pointer',
        background: active ? 'rgba(196,146,42,0.2)' : 'rgba(0,0,0,0.25)',
        border: active ? '1.5px solid rgba(196,146,42,0.6)' : '1.5px solid rgba(120,80,30,0.2)',
        color: active ? '#c4922a' : '#8d6e3f',
      }}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div style={{ width: '100%', textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', fontStyle: 'italic' }}>
      No cards match.
    </div>
  );
}

// ─── Lore card thumb (grid item) ────────────────────────────────────────────

function LoreCardThumb({
  milestone,
  loreNumber,
  unlocked,
  onClick,
}: {
  milestone: LoreMilestone;
  loreNumber: number;
  unlocked: boolean;
  onClick: () => void;
}) {
  const W = 150;
  const H = 210;
  const artUrl = unlocked ? IMAGE_MANIFEST[`lore/${milestone.stage}`] ?? null : null;

  return (
    <div
      onClick={onClick}
      style={{
        width: W,
        height: H,
        borderRadius: 12,
        cursor: unlocked ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
        background: unlocked
          ? (artUrl
            ? `linear-gradient(180deg, rgba(20,10,30,0.0) 30%, rgba(20,10,30,0.85) 80%, rgba(20,10,30,0.95) 100%), url(${artUrl}) center/cover`
            : 'linear-gradient(135deg, #3a2050 0%, #1a0f2a 60%, #0a0515 100%)')
          : 'linear-gradient(135deg, #1a1626 0%, #0c0a14 100%)',
        border: unlocked ? '1.5px solid rgba(200,160,255,0.55)' : '1.5px solid rgba(255,255,255,0.08)',
        boxShadow: unlocked
          ? '0 0 16px rgba(160,100,240,0.25), 0 4px 12px rgba(0,0,0,0.5)'
          : '0 4px 10px rgba(0,0,0,0.4)',
        opacity: unlocked ? 1 : 0.6,
        transition: 'transform 180ms ease-out, box-shadow 180ms ease-out',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: 10,
        color: '#f5e6ff',
      }}
      onMouseEnter={(e) => {
        if (unlocked) e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Lore number badge */}
      <div
        style={{
          position: 'absolute',
          top: 8, left: 8,
          padding: '2px 7px',
          borderRadius: 99,
          background: unlocked
            ? 'linear-gradient(180deg, rgba(200,160,255,0.35) 0%, rgba(120,80,180,0.25) 100%)'
            : 'rgba(255,255,255,0.06)',
          border: unlocked ? '1px solid rgba(200,160,255,0.55)' : '1px solid rgba(255,255,255,0.12)',
          fontSize: '0.55rem',
          fontWeight: 800,
          letterSpacing: '0.18em',
          color: unlocked ? '#f5e6ff' : '#6c5d80',
          textShadow: unlocked ? '0 1px 2px rgba(0,0,0,0.6)' : 'none',
        }}
      >
        LORE #{loreNumber}
      </div>

      {/* Center decoration when no art / locked */}
      {!artUrl && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '3.5rem',
            opacity: unlocked ? 0.22 : 0.35,
            filter: unlocked ? 'drop-shadow(0 0 10px rgba(200,160,255,0.6))' : 'none',
            pointerEvents: 'none',
            color: unlocked ? '#f5e6ff' : '#3d3550',
          }}
        >
          {unlocked ? '📜' : '🔒'}
        </div>
      )}

      {/* Title at bottom */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div
          className="sb-display"
          style={{
            fontSize: '0.78rem',
            lineHeight: 1.15,
            color: unlocked ? '#fff5e0' : '#5d5470',
            textShadow: unlocked ? '0 2px 4px rgba(0,0,0,0.85)' : 'none',
            letterSpacing: '0.03em',
          }}
        >
          {unlocked ? milestone.title : '???'}
        </div>
      </div>
    </div>
  );
}

// ─── Enemy detail popover ────────────────────────────────────────────────────

function EnemyDetailPopover({ enemy, onClose }: { enemy: EnemyDef; onClose: () => void }) {
  const accentColor = { easy: '#4ade80', medium: '#fb923c', hard: '#f87171' }[enemy.difficulty] ?? '#94a3b8';
  const dmgColor = DAMAGE_TYPE_COLOR[enemy.damageType] ?? '#cbd5e1';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: '16px 12px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, #0e1a10 0%, #0a1210 60%, #0c0c14 100%)',
          border: `1.5px solid ${accentColor}44`,
          borderRadius: 18,
          maxWidth: 380,
          width: '100%',
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'hidden',
          boxShadow: `0 0 40px ${accentColor}25, 0 24px 80px rgba(0,0,0,0.9)`,
        }}
      >
        {/* ── Top: large card artwork ── */}
        <div style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '28px 24px 20px',
          background: `linear-gradient(160deg, ${accentColor}10 0%, transparent 60%)`,
          borderBottom: `1px solid ${accentColor}22`,
          flexShrink: 0,
        }}>
          {/* Decorative corner accents */}
          <div style={{ position: 'absolute', top: 10, left: 12, width: 18, height: 18, borderTop: `1.5px solid ${accentColor}60`, borderLeft: `1.5px solid ${accentColor}60`, borderRadius: '3px 0 0 0' }} />
          <div style={{ position: 'absolute', top: 10, right: 12, width: 18, height: 18, borderTop: `1.5px solid ${accentColor}60`, borderRight: `1.5px solid ${accentColor}60`, borderRadius: '0 3px 0 0' }} />
          <div style={{ position: 'absolute', bottom: 10, left: 12, width: 18, height: 18, borderBottom: `1.5px solid ${accentColor}60`, borderLeft: `1.5px solid ${accentColor}60`, borderRadius: '0 0 0 3px' }} />
          <div style={{ position: 'absolute', bottom: 10, right: 12, width: 18, height: 18, borderBottom: `1.5px solid ${accentColor}60`, borderRight: `1.5px solid ${accentColor}60`, borderRadius: '0 0 3px 0' }} />

          <EnemyCard enemy={enemy} size="xl" />
        </div>

        {/* ── Bottom: scrollable info panel ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 18px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          scrollbarWidth: 'none',
        }}>
          {/* Name + classification */}
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: '1.45rem',
              color: '#f1f5f9',
              lineHeight: 1.1,
            }}>
              {enemy.name}
            </div>
            <div style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.12em',
              color: accentColor,
              marginTop: 4,
            }}>
              {enemy.archetype.toUpperCase()} · {enemy.biome?.toUpperCase() ?? 'UNKNOWN'} · {enemy.difficulty.toUpperCase()}
            </div>
          </div>

          {/* Stat row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <StatBlock label="HP"    value={enemy.baseHp} color="#f87171" />
            <StatBlock label="ATK"   value={enemy.atk}    color="#fbbf24" />
            <StatBlock label="DEF"   value={enemy.def}    color="#94a3b8" />
            <StatBlock label="SPD"   value={enemy.speed}  color="#c4b5fd" />
          </div>

          {/* Damage type + resistances row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              background: `${dmgColor}14`,
              borderRadius: 6,
              border: `1px solid ${dmgColor}30`,
            }}>
              <span style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.6rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#475569',
              }}>DMG</span>
              <span style={{
                fontFamily: "'Fredoka One', cursive",
                fontSize: '0.82rem',
                color: dmgColor,
                letterSpacing: '0.04em',
              }}>{enemy.damageType.toUpperCase()}</span>
            </div>
            {enemy.resistances && Object.entries(enemy.resistances).map(([type, mult]) => (
              <ResistancePip key={type} type={type} multiplier={mult} />
            ))}
          </div>

          {/* Lore text */}
          {enemy.lore && (
            <div style={{
              padding: '12px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${accentColor}18`,
              borderRadius: 10,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute',
                top: -8,
                left: 12,
                background: '#0e1a10',
                padding: '0 6px',
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.58rem',
                fontWeight: 800,
                letterSpacing: '0.12em',
                color: accentColor,
                opacity: 0.8,
              }}>LORE</div>
              <p style={{
                margin: 0,
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.75rem',
                fontWeight: 400,
                lineHeight: 1.65,
                color: '#94a3b8',
                fontStyle: 'italic',
              }}>
                {enemy.lore}
              </p>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${accentColor}30`,
              borderRadius: 10,
              color: '#64748b',
              padding: '9px 0',
              cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.1em',
              width: '100%',
              transition: 'all 120ms ease',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${color}22`,
      borderRadius: 8,
      padding: '6px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 1,
    }}>
      <span style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: '0.6rem',
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: '#334155',
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "'Fredoka One', cursive",
        fontSize: '1.1rem',
        color,
        lineHeight: 1,
      }}>
        {value}
      </span>
    </div>
  );
}

function ResistancePip({ type, multiplier }: { type: string; multiplier: number }) {
  const isWeak = multiplier > 1;
  const isResist = multiplier < 1;
  const color = isWeak ? '#f87171' : isResist ? '#4ade80' : '#94a3b8';
  const label = isWeak ? `▲ ${type}` : isResist ? `▼ ${type}` : `= ${type}`;
  const pct = multiplier === 0 ? 'IMM' : `×${multiplier}`;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      background: `${color}12`,
      border: `1px solid ${color}30`,
      borderRadius: 5,
      padding: '2px 7px',
      color,
      fontFamily: "'Nunito', sans-serif",
      fontSize: '0.65rem',
      fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      {label.toUpperCase()} <span style={{ opacity: 0.65 }}>{pct}</span>
    </div>
  );
}

// ─── Lore detail modal (read view) ──────────────────────────────────────────

function LoreDetailModal({
  milestone,
  loreNumber,
  onClose,
}: {
  milestone: LoreMilestone;
  loreNumber: number;
  onClose: () => void;
}) {
  const artUrl = IMAGE_MANIFEST[`lore/${milestone.stage}`] ?? null;
  if (typeof document === 'undefined') return null;
  // Portal to body so the modal escapes any ancestor with `transform`
  // (e.g. .sb-fade-up) that would otherwise act as a containing block for
  // `position: fixed` and trap us in the wrong stacking context.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="pb-pop-in"
        style={{
          width: '100%', maxWidth: 440, borderRadius: 16, overflow: 'hidden',
          background: 'linear-gradient(160deg, #1a0f2a 0%, #100819 100%)',
          border: '1.5px solid rgba(200,160,255,0.5)',
          boxShadow: '0 0 32px rgba(160,100,240,0.3), 0 20px 60px rgba(0,0,0,0.85)',
          color: '#f5e6ff',
        }}
      >
        {/* Banner image (if art exists) */}
        {artUrl && (
          <div
            style={{
              height: 140,
              background: `linear-gradient(180deg, rgba(20,10,30,0.0) 0%, rgba(20,10,30,0.7) 100%), url(${artUrl}) center/cover`,
            }}
          />
        )}

        <div style={{ padding: 18 }}>
          <div
            className="text-[10px] uppercase font-extrabold mb-1"
            style={{ color: '#c8b8e8', letterSpacing: '0.3em' }}
          >
            LORE #{loreNumber}
          </div>
          <h2
            className="sb-display"
            style={{
              fontSize: '1.25rem',
              lineHeight: 1.25,
              color: '#fff5e0',
              textShadow: '0 0 10px rgba(200,160,255,0.4)',
              marginBottom: 12,
              letterSpacing: '0.04em',
            }}
          >
            {milestone.title}
          </h2>
          <div
            style={{
              fontSize: '0.82rem',
              lineHeight: 1.6,
              color: '#e0d0f0',
              marginBottom: 14,
              maxHeight: '40vh',
              overflowY: 'auto',
              paddingRight: 4,
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(200,160,255,0.4) transparent',
            }}
          >
            {milestone.text}
          </div>
          <div
            style={{
              fontSize: '0.65rem',
              color: '#a892c8',
              opacity: 0.8,
              marginBottom: 12,
            }}
          >
            Reward: <strong style={{ color: '#f5e6ff' }}>{milestone.rewardCosmeticLabel}</strong>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 8,
              background: 'rgba(200,160,255,0.15)',
              border: '1.5px solid rgba(200,160,255,0.4)',
              color: '#f5e6ff', cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', fontWeight: 800,
              letterSpacing: '0.1em',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

