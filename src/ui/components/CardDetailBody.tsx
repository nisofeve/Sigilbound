// Shared card detail body — used by the card vault popover, encyclopedia modal,
// combat shop inspect panel, and battle info modal. Provides a consistent layout:
// card visual + header row, stat block, effect/description text, symbol legend.
//
// Does NOT include the outer modal shell (backdrop, close button, positioning) —
// callers wrap this in whatever container they need.

import type { ActionCardDef, TacticCardDef, EquipmentDef, Perk } from '@engine/index';
import { CombatCard } from './CombatCard';
import { EquipmentCard } from './EquipmentCard';
import { TalentCard } from './TalentCard';
import { RARITY_COLOR, DAMAGE_TYPE_COLOR } from './GameCard';

const RARITY_LABEL: Record<string, string> = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare',
  epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

export function RarityBadge({ rarity, accent }: { rarity: string; accent: string }) {
  return (
    <span style={{
      fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em',
      padding: '2px 7px', borderRadius: 99,
      background: accent, color: '#0f172a',
    }}>
      {(RARITY_LABEL[rarity] ?? rarity).toUpperCase()}
    </span>
  );
}

function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ fontSize: '0.7rem', color: '#64748b', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: color ?? '#e2d5b0' }}>{value}</span>
    </div>
  );
}

function SymbolLegend({ isAction }: { isAction: boolean }) {
  const rows = isAction
    ? [
        { glyph: '⚔', label: 'Damage per hit' },
        { glyph: '⏳', label: 'Charge turns before striking' },
        { glyph: '◆', label: 'Stamina cost' },
        { glyph: '×N', label: 'Hits N times' },
        { glyph: '🔥', label: 'Fire' },
        { glyph: '❄️', label: 'Ice' },
        { glyph: '⚡', label: 'Lightning' },
        { glyph: '☠', label: 'Poison' },
        { glyph: '✦', label: 'Arcane / Pure' },
      ]
    : [
        { glyph: '◆', label: 'Stamina cost' },
        { glyph: '∞', label: 'Persistent — stays active' },
        { glyph: '⚡', label: 'Speed / haste effect' },
        { glyph: '🛡', label: 'Defensive / shield effect' },
      ];

  return (
    <div style={{
      marginTop: 10,
      borderTop: '1px solid rgba(255,255,255,0.07)',
      paddingTop: 8,
    }}>
      <div style={{
        fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em',
        color: '#475569', marginBottom: 5,
      }}>
        SYMBOL GUIDE
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 14px' }}>
        {rows.map(({ glyph, label }) => (
          <div key={glyph} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: '0.65rem', minWidth: 16, textAlign: 'center', opacity: 0.85 }}>
              {glyph}
            </span>
            <span style={{ fontSize: '0.57rem', color: '#64748b', lineHeight: 1.2 }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Battle card detail ────────────────────────────────────────────────────────

export function BattleCardDetail({ card }: { card: ActionCardDef | TacticCardDef }) {
  const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
  const isAction = card.type === 'action';
  const act = card as ActionCardDef;
  const tac = card as TacticCardDef;
  const dmgColor = isAction ? (DAMAGE_TYPE_COLOR[act.damageType] ?? '#cbd5e1') : '#a78bfa';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header: card visual + name/badges */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <CombatCard card={card} size="sm" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fredoka One', cursive", fontSize: '1.05rem',
            color: '#f1f5f9', lineHeight: 1.15, marginBottom: 6,
          }}>
            {card.name}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <RarityBadge rarity={card.rarity} accent={accent} />
            <span style={{
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', color: dmgColor,
            }}>
              {isAction ? act.damageType.toUpperCase() : 'TACTIC'}
            </span>
            {isAction && act.hits !== undefined && act.hits > 1 && (
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fbbf24' }}>
                ×{act.hits} hits
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stat block */}
      <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '8px 12px' }}>
        {isAction ? (
          <>
            <StatRow label="⚔  Damage" value={act.damage} color="#fbbf24" />
            <StatRow label="⏳  Charge turns" value={act.charge} color="#94a3b8" />
            <StatRow label="◆  Stamina cost" value={act.cost} color="#86efac" />
            {act.hits !== undefined && act.hits > 1 && (
              <StatRow label="×  Hits" value={act.hits} color="#fbbf24" />
            )}
          </>
        ) : (
          <>
            <StatRow label="◆  Stamina cost" value={tac.cost} color="#86efac" />
            {tac.persistent && <StatRow label="∞  Persistent" value="Yes" color="#c4b5fd" />}
          </>
        )}
      </div>

      {/* Effect / description text */}
      {(isAction ? act.effect : tac.description) && (
        <p style={{
          fontSize: '0.73rem', lineHeight: 1.5, color: '#cbd5e1',
          fontStyle: 'italic', margin: 0,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderLeft: `2px solid ${accent}40`,
          borderRadius: '0 6px 6px 0',
        }}>
          {isAction ? act.effect : tac.description}
        </p>
      )}

      <SymbolLegend isAction={isAction} />
    </div>
  );
}

// ─── Equipment detail ──────────────────────────────────────────────────────────

export function EquipmentDetail({ eq }: { eq: EquipmentDef }) {
  const accent = RARITY_COLOR[eq.rarity] ?? RARITY_COLOR.common;
  const stats = eq.stats ?? {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <EquipmentCard equipment={eq} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fredoka One', cursive", fontSize: '1.05rem',
            color: '#f1f5f9', lineHeight: 1.15, marginBottom: 6,
          }}>
            {eq.name}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <RarityBadge rarity={eq.rarity} accent={accent} />
            <span style={{
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', color: '#94a3b8',
            }}>
              {eq.slot.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {eq.description && (
        <p style={{
          fontSize: '0.73rem', lineHeight: 1.5, color: '#cbd5e1',
          fontStyle: 'italic', margin: 0,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderLeft: `2px solid ${accent}40`,
          borderRadius: '0 6px 6px 0',
        }}>
          {eq.description}
        </p>
      )}

      {Object.keys(stats).length > 0 && (
        <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '8px 12px' }}>
          {stats.maxHp      !== undefined && <StatRow label="❤  Max HP"       value={`+${stats.maxHp}`}        color="#f87171" />}
          {stats.atk        !== undefined && <StatRow label="⚔  Attack"        value={`+${stats.atk}`}         color="#fbbf24" />}
          {stats.def        !== undefined && <StatRow label="🛡  Defense"       value={`+${stats.def}`}         color="#60a5fa" />}
          {stats.critChance !== undefined && <StatRow label="✦  Crit Chance"   value={`+${stats.critChance}%`} color="#c084fc" />}
          {stats.speed      !== undefined && <StatRow label="⚡  Speed"         value={`+${stats.speed}`}       color="#fcd34d" />}
          {stats.stamina    !== undefined && <StatRow label="◆  Stamina"        value={`+${stats.stamina}`}     color="#86efac" />}
          {stats.sigilSlots !== undefined && <StatRow label="🔮  Sigil Slots"   value={`+${stats.sigilSlots}`}  color="#a78bfa" />}
          {stats.handSize   !== undefined && <StatRow label="🃏  Hand Size"     value={`+${stats.handSize}`}    color="#e2e8f0" />}
        </div>
      )}
    </div>
  );
}

// ─── Talent detail ─────────────────────────────────────────────────────────────

export function TalentDetail({ perk }: { perk: Perk }) {
  const accent = RARITY_COLOR[perk.rarity] ?? RARITY_COLOR.common;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          <TalentCard talent={perk} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fredoka One', cursive", fontSize: '1.05rem',
            color: '#f1f5f9', lineHeight: 1.15, marginBottom: 6,
          }}>
            {perk.name}
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
            <RarityBadge rarity={perk.rarity} accent={accent} />
            <span style={{
              fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', color: '#c4b5fd',
            }}>
              {perk.kind?.toUpperCase() ?? 'TALENT'}
            </span>
          </div>
        </div>
      </div>

      {perk.description && (
        <p style={{
          fontSize: '0.73rem', lineHeight: 1.5, color: '#cbd5e1',
          margin: 0,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.03)',
          borderLeft: `2px solid ${accent}40`,
          borderRadius: '0 6px 6px 0',
        }}>
          {perk.description}
        </p>
      )}
    </div>
  );
}

// ─── Outer modal shell ─────────────────────────────────────────────────────────
// Shared backdrop + card for screens that need a full modal (encyclopedia, etc.)

type DetailTarget =
  | { kind: 'battle'; card: ActionCardDef | TacticCardDef }
  | { kind: 'equipment'; eq: EquipmentDef }
  | { kind: 'talent'; perk: Perk };

function accentForTarget(t: DetailTarget): string {
  if (t.kind === 'battle')    return RARITY_COLOR[t.card.rarity]  ?? RARITY_COLOR.common;
  if (t.kind === 'equipment') return RARITY_COLOR[t.eq.rarity]    ?? RARITY_COLOR.common;
  return RARITY_COLOR[t.perk.rarity] ?? RARITY_COLOR.common;
}

export function CardDetailModal({ target, onClose, footer }: {
  target: DetailTarget;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const accent = accentForTarget(target);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 400, borderRadius: 16, overflow: 'hidden',
          background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
          border: `1.5px solid ${accent}`,
          boxShadow: `0 0 32px ${accent}28, 0 20px 60px rgba(0,0,0,0.85)`,
          color: '#e2e8f0',
        }}
      >
        <div style={{ padding: 16 }}>
          {target.kind === 'battle'    && <BattleCardDetail card={target.card} />}
          {target.kind === 'equipment' && <EquipmentDetail eq={target.eq} />}
          {target.kind === 'talent'    && <TalentDetail perk={target.perk} />}
        </div>
        {footer && (
          <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {footer}
          </div>
        )}
        {!footer && (
          <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '8px 0', borderRadius: 8, marginTop: 10,
                background: 'rgba(196,146,42,0.12)',
                border: '1.5px solid rgba(196,146,42,0.35)',
                color: 'var(--sb-gold-light)', cursor: 'pointer',
                fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', fontWeight: 800,
              }}
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
