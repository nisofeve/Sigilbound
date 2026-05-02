// Card Encyclopedia — lists all battle cards, equipment, and talents.
// Mirrors the BestiaryScreen pattern: filter tabs + card grid + detail modal.

import { useState, useMemo } from 'react';
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
import { CombatCard } from '@ui/components/CombatCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { TalentCard } from '@ui/components/TalentCard';
import { CardDetailModal } from '@ui/components/CardDetailBody';

type EncTab = 'battle' | 'equipment' | 'talent';
type BattleFilter = 'all' | 'action' | 'tactic';
type EquipFilter = 'all' | string; // slot name
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

interface Props {
  onBack: () => void;
}

type DetailTarget =
  | { kind: 'battle'; card: ActionCardDef | TacticCardDef }
  | { kind: 'equipment'; eq: EquipmentDef }
  | { kind: 'talent'; perk: Perk };

export default function CardEncyclopediaScreen({ onBack }: Props) {
  const [tab, setTab] = useState<EncTab>('battle');
  const [battleFilter, setBattleFilter] = useState<BattleFilter>('all');
  const [equipFilter, setEquipFilter] = useState<EquipFilter>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<DetailTarget | null>(null);

  const allActs = useMemo(() => allActions(), []);
  const allTacs = useMemo(() => allTactics(), []);
  const allEqs = useMemo(() => allEquipment(), []);
  const allTals = useMemo(() => allTalents(), []);

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
          {tab === 'battle' ? battleCards.length :
           tab === 'equipment' ? equipCards.length :
           talentCards.length} entries
        </div>
      </div>

      {/* Tab row */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 16px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        {(['battle', 'equipment', 'talent'] as EncTab[]).map(t => (
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
            {t === 'battle' ? '⚔ Battle Cards' : t === 'equipment' ? '🛡 Equipment' : '💎 Talents'}
          </button>
        ))}
      </div>

      {/* Search + filter bar */}
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
      </div>

      {/* Detail modal */}
      {detail && <CardDetailModal target={detail} onClose={() => setDetail(null)} />}
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

