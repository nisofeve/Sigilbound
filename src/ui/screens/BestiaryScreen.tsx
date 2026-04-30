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
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          gap: 20,
          alignItems: 'flex-start',
          background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
          border: `1.5px solid ${accentColor}`,
          borderRadius: 16,
          padding: 20,
          maxWidth: 480,
          width: '100%',
          boxShadow: `0 0 30px ${accentColor}30, 0 20px 60px rgba(0,0,0,0.8)`,
        }}
      >
        {/* Card (large) */}
        <EnemyCard enemy={enemy} size="lg" />

        {/* Info panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {/* Name + type */}
          <div>
            <div style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: '1.25rem',
              color: '#f1f5f9',
              lineHeight: 1.1,
            }}>
              {enemy.name}
            </div>
            <div style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: accentColor,
              marginTop: 2,
            }}>
              {enemy.archetype.toUpperCase()} · {enemy.biome?.toUpperCase() ?? 'UNKNOWN'}
            </div>
          </div>

          {/* Stat grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
          }}>
            <StatBlock label="HP"    value={enemy.baseHp}    color="#f87171" />
            <StatBlock label="ATK"   value={enemy.atk}       color="#fbbf24" />
            <StatBlock label="DEF"   value={enemy.def}       color="#94a3b8" />
            <StatBlock label="SPEED" value={enemy.speed}     color="#c4b5fd" />
          </div>

          {/* Damage type */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.65rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#475569',
            }}>
              DMG TYPE
            </span>
            <span style={{
              fontFamily: "'Fredoka One', cursive",
              fontSize: '0.85rem',
              color: dmgColor,
              letterSpacing: '0.05em',
            }}>
              {enemy.damageType.toUpperCase()}
            </span>
          </div>

          {/* Resistances */}
          {enemy.resistances && Object.keys(enemy.resistances).length > 0 && (
            <div>
              <div style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.62rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                color: '#334155',
                marginBottom: 5,
              }}>
                RESISTANCES
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.entries(enemy.resistances).map(([type, mult]) => (
                  <ResistancePip key={type} type={type} multiplier={mult} />
                ))}
              </div>
            </div>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            style={{
              marginTop: 'auto',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#64748b',
              padding: '7px 0',
              cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.07em',
              width: '100%',
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
