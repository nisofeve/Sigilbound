// BestiaryScreen — enemy card gallery.
// Shows all enemies as portrait cards grouped by biome.
// Tapping a card opens a detail popover with full stats + resistances.

import { useState, useMemo } from 'react';
import { EnemyCard } from '@ui/components/EnemyCard';
import type { EnemyDef } from '@engine/enemy';
import enemiesJson from '@data/enemies.json';

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
  physical: '#cbd5e1',
  fire:     '#fca5a5',
  ice:      '#93c5fd',
  dark:     '#c4b5fd',
  nature:   '#86efac',
  holy:     '#fde68a',
  thunder:  '#fcd34d',
};

interface Props {
  onBack: () => void;
}

export default function BestiaryScreen({ onBack }: Props) {
  const [selected, setSelected] = useState<EnemyDef | null>(null);
  const [biomeFilter, setBiomeFilter] = useState<string>('all');

  const grouped = useMemo(() => {
    const filtered = biomeFilter === 'all'
      ? ALL_ENEMIES
      : ALL_ENEMIES.filter(e => e.biome === biomeFilter);

    const map = new Map<string, EnemyDef[]>();
    for (const e of filtered) {
      const b = e.biome ?? 'unknown';
      if (!map.has(b)) map.set(b, []);
      map.get(b)!.push(e);
    }
    // Sort by the canonical biome order
    return BIOME_ORDER
      .filter(b => map.has(b))
      .map(b => ({ biome: b, enemies: map.get(b)! }));
  }, [biomeFilter]);

  const availableBiomes = useMemo(() =>
    BIOME_ORDER.filter(b => ALL_ENEMIES.some(e => e.biome === b)),
    [],
  );

  return (
    <div
      className="safe-top safe-bottom"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(160deg, #0a1a0c 0%, #060d07 60%, #0c0c10 100%)',
        color: '#e2e8f0',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 16px 10px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            color: '#94a3b8',
            padding: '6px 10px',
            cursor: 'pointer',
            fontFamily: "'Nunito', sans-serif",
            fontSize: '0.8rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          ← BACK
        </button>
        <div style={{
          flex: 1,
          fontFamily: "'Fredoka One', cursive",
          fontSize: '1.3rem',
          color: '#f1f5f9',
          letterSpacing: '0.04em',
        }}>
          Bestiary
        </div>
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: '0.7rem',
          fontWeight: 700,
          color: '#475569',
          letterSpacing: '0.1em',
        }}>
          {ALL_ENEMIES.length} ENEMIES
        </div>
      </div>

      {/* ── Biome filter tabs ── */}
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '10px 16px 8px',
        overflowX: 'auto',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {['all', ...availableBiomes].map(b => (
          <button
            key={b}
            onClick={() => setBiomeFilter(b)}
            style={{
              flexShrink: 0,
              background: biomeFilter === b
                ? 'rgba(251,146,60,0.2)'
                : 'rgba(255,255,255,0.05)',
              border: `1px solid ${biomeFilter === b ? '#fb923c' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 20,
              color: biomeFilter === b ? '#fb923c' : '#64748b',
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              whiteSpace: 'nowrap',
              transition: 'all 120ms ease',
            }}
          >
            {b === 'all' ? '⚔ ALL' : BIOME_LABEL[b] ?? b.toUpperCase()}
          </button>
        ))}
      </div>

      {/* ── Card grid ── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 16px 24px',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.1) transparent',
      }}>
        {grouped.map(({ biome, enemies }) => (
          <div key={biome} style={{ marginBottom: 28 }}>
            {/* Biome section header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
              marginTop: 8,
            }}>
              <span style={{
                fontFamily: "'Fredoka One', cursive",
                fontSize: '0.9rem',
                color: '#94a3b8',
                letterSpacing: '0.05em',
              }}>
                {BIOME_LABEL[biome] ?? biome}
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.07)' }} />
              <span style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.65rem',
                fontWeight: 700,
                color: '#334155',
                letterSpacing: '0.1em',
              }}>
                {enemies.length}
              </span>
            </div>

            {/* Card row */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 10,
            }}>
              {enemies.map(e => (
                <EnemyCard
                  key={e.id}
                  enemy={e}
                  size="md"
                  onClick={() => setSelected(e)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Detail popover ── */}
      {selected && (
        <EnemyDetailPopover
          enemy={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ─── Detail popover ───────────────────────────────────────────────────────────

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
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8,
          color: '#94a3b8',
          width: 36,
          height: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '1.1rem',
          lineHeight: 1,
          transition: 'background 120ms ease, color 120ms ease',
          zIndex: 10,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)'; (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
      >
        ✕
      </button>
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
