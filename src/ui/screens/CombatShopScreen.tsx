// Sigilbound combat shop — 3x3 Grid layout with tabs.

import { useEffect, useMemo, useState } from 'react';
import {
  type ActionCardDef,
  type TacticCardDef,
  type EquipmentDef,
  type Perk,
  type CombatShopEntry,
} from '@engine/index';
import {
  buyCombatShopEntry,
  getCombatShopRoll,
  rolloverCombatShop,
  rerollCombatShop,
  combatShopRerollCost,
  type Profile,
} from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { TalentCard } from '@ui/components/TalentCard';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

export default function CombatShopScreen({ profile, onProfileChange, onBack }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [msg, setMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cards' | 'equipment' | 'talents'>('cards');
  const [inspectEntry, setInspectEntry] = useState<CombatShopEntry | null>(null);
  const [purchaseQuantity, setPurchaseQuantity] = useState(1);

  // Roll over the shop tracking on mount if today is fresh.
  useEffect(() => {
    const next = rolloverCombatShop(profile, today);
    if (next !== profile) onProfileChange(next);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  const shopRoll = useMemo(() => getCombatShopRoll(profile, today), [profile, today]);
  const entries = shopRoll[activeTab] || [];
  const refreshCost = combatShopRerollCost(profile);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  function buy(entry: CombatShopEntry, payWith: 'gold' | 'crystals', quantity: number = 1) {
    const r = buyCombatShopEntry(profile, entry, payWith, quantity);
    if (!r.ok) {
      flash(r.reason);
      return;
    }
    onProfileChange(r.profile);
    flash(`✓ ${quantity}x ${entry.def.name} purchased`);
    if (inspectEntry && inspectEntry.cardId === entry.cardId) {
      setInspectEntry(null); // Close modal on buy
    }
  }

  function handleInspect(entry: CombatShopEntry) {
    setInspectEntry(entry);
    setPurchaseQuantity(1); // Reset slider
  }

  function doRefresh() {
    const r = rerollCombatShop(profile);
    if (!r.ok) {
      flash(r.reason);
      return;
    }
    onProfileChange(r.profile);
    flash(`✓ Shop refreshed`);
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom">

      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
          ← HOME
        </button>
        <div className="sb-display sb-banner-iron px-4 py-1" style={{ fontSize: '12px', letterSpacing: '0.3em' }}>
          🛒 BAZAAR
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Currency strip */}
      <div className="relative z-10 px-3 pb-2 flex items-center gap-2">
        <CurrencyChip icon="💰" label="GOLD" value={profile.bankCoins} accent="var(--sb-gold)" />
        <CurrencyChip icon="💎" label="CRYSTALS" value={profile.gems} accent="#93c5fd" />
        <button
          onClick={doRefresh}
          className="sb-btn"
          style={{
            padding: '6px 10px',
            fontSize: '10px',
            background: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)',
            border: '1.5px solid #93c5fd',
            boxShadow: '0 0 10px rgba(29,78,216,0.5)',
            letterSpacing: '0.1em'
          }}
        >
          REFRESH<br/>💎 {refreshCost}
        </button>
      </div>

      {/* Tabs */}
      <div className="relative z-10 px-3 pb-3 flex gap-2">
        {(['cards', 'equipment', 'talents'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="sb-display flex-1 py-2"
            style={{
              background: activeTab === tab ? 'var(--sb-leather-dark)' : 'rgba(0,0,0,0.4)',
              border: `1.5px solid ${activeTab === tab ? 'var(--sb-gold)' : 'var(--sb-bronze-dark)'}`,
              color: activeTab === tab ? 'var(--sb-gold-light)' : 'var(--sb-bronze-light)',
              borderRadius: '4px',
              fontSize: '11px',
              letterSpacing: '0.15em',
            }}
          >
            {tab.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Stock — 3x3 Grid */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-3 sb-fade-up">
        <div className="grid grid-cols-3 gap-2">
          {entries.map((entry, idx) => {
            const boughtCount = profile.combatShopBoughtCounts[entry.cardId] ?? 0;
            const remaining = entry.copiesAvailable - boughtCount;
            const soldOut = remaining <= 0;
            const isEquipment = entry.kind === 'equipment';

            return (
              <div
                key={`${entry.cardId}-${idx}`}
                className="relative flex flex-col items-center justify-center p-2 rounded-lg"
                style={{
                  background: 'linear-gradient(160deg, rgba(20,14,8,0.85) 0%, rgba(10,8,5,0.92) 100%)',
                  border: '1px solid rgba(255,235,180,0.18)',
                  opacity: soldOut ? 0.4 : 1,
                  cursor: 'pointer'
                }}
                onClick={() => !soldOut && handleInspect(entry)}
              >
                {/* Copies Badge */}
                <div
                  className="absolute top-1 left-1 z-20 px-1.5 py-0.5 rounded"
                  style={{
                    background: 'rgba(0,0,0,0.8)',
                    border: '1px solid var(--sb-bronze)',
                    color: soldOut ? '#fca5a5' : '#86efac',
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                  }}
                >
                  {remaining}/{entry.copiesAvailable}
                </div>

                {/* Card rendering */}
                <div className="flex-1 w-full flex items-center justify-center my-2 pointer-events-none">
                  {entry.kind === 'action' || entry.kind === 'tactic' ? (
                    <CombatCard card={entry.def as ActionCardDef | TacticCardDef} size="sm" />
                  ) : entry.kind === 'equipment' ? (
                    <EquipmentCard equipment={entry.def as EquipmentDef} size="sm" />
                  ) : (
                    <TalentCard talent={entry.def as Perk} size="sm" />
                  )}
                </div>

                {/* Price Label (info only) */}
                <div className="mt-1 w-full flex items-center justify-center gap-2 text-[10px] opacity-80">
                  {!isEquipment && <span>💰 {entry.goldPrice >= Infinity ? '---' : entry.goldPrice}</span>}
                  <span>💎 {entry.crystalPrice}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom flash messages */}
      {msg && (
        <div className="relative z-20 px-3 pb-2">
          <div
            className="sb-display text-center px-3 py-2"
            style={{
              fontSize: '11px',
              letterSpacing: '0.18em',
              background: msg.startsWith('✓') ? 'rgba(74,222,128,0.25)' : 'rgba(220,38,38,0.25)',
              border: msg.startsWith('✓') ? '1.5px solid #4ade80' : '1.5px solid var(--sb-crimson-light)',
              borderRadius: '3px',
              color: msg.startsWith('✓') ? '#86efac' : '#fecaca',
            }}
          >
            {msg.toUpperCase()}
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {inspectEntry && (() => {
        const boughtCount = profile.combatShopBoughtCounts[inspectEntry.cardId] ?? 0;
        const maxAvailable = inspectEntry.copiesAvailable - boughtCount;
        const goldCost = inspectEntry.goldPrice * purchaseQuantity;
        const crystalCost = inspectEntry.crystalPrice * purchaseQuantity;

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) setInspectEntry(null); }}
          >
            <div className="relative w-full max-w-sm flex flex-col items-center">
              {/* Display the large card */}
              <div className="mb-4 w-full flex justify-center" style={{ pointerEvents: 'none' }}>
                {inspectEntry.kind === 'action' || inspectEntry.kind === 'tactic' ? (
                  <CombatCard card={inspectEntry.def as ActionCardDef | TacticCardDef} customWidth={240} />
                ) : inspectEntry.kind === 'equipment' ? (
                  <EquipmentCard equipment={inspectEntry.def as EquipmentDef} customWidth={240} />
                ) : (
                  <TalentCard talent={inspectEntry.def as Perk} customWidth={240} />
                )}
              </div>

              {/* Modal Actions */}
              <div className="w-full flex flex-col gap-2 p-4 rounded-lg" style={{ background: 'var(--sb-leather-dark)', border: '2px solid var(--sb-gold)' }}>
                <div className="text-center sb-display text-lg mb-2" style={{ color: 'var(--sb-gold-light)' }}>
                  {inspectEntry.def.name}
                </div>
                <div className="text-center text-xs mb-4" style={{ color: 'var(--sb-parchment)' }}>
                  {'description' in inspectEntry.def ? (inspectEntry.def as any).description : 'A powerful combat card.'}
                </div>
                
                {maxAvailable > 1 && (
                  <div className="flex flex-col items-center mb-4">
                    <label className="text-xs mb-2" style={{ color: 'var(--sb-gold-light)' }}>Quantity: {purchaseQuantity}</label>
                    <input 
                      type="range" 
                      min="1" 
                      max={maxAvailable} 
                      value={purchaseQuantity} 
                      onChange={(e) => setPurchaseQuantity(parseInt(e.target.value))} 
                      className="w-full"
                    />
                  </div>
                )}
                
                <div className="flex gap-2">
                  {inspectEntry.kind !== 'equipment' && (
                    <button
                      onClick={() => buy(inspectEntry, 'gold', purchaseQuantity)}
                      disabled={profile.bankCoins < goldCost}
                      className="sb-btn sb-btn-gold flex-1 py-2"
                      style={{ opacity: profile.bankCoins < goldCost ? 0.5 : 1 }}
                    >
                      BUY 💰 {goldCost >= Infinity ? '---' : goldCost.toLocaleString()}
                    </button>
                  )}
                  <button
                    onClick={() => buy(inspectEntry, 'crystals', purchaseQuantity)}
                    disabled={profile.gems < crystalCost}
                    className="sb-btn flex-1 py-2"
                    style={{
                      background: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)',
                      border: '1.5px solid #93c5fd',
                      opacity: profile.gems < crystalCost ? 0.5 : 1
                    }}
                  >
                    BUY 💎 {crystalCost.toLocaleString()}
                  </button>
                </div>
                <button
                  onClick={() => setInspectEntry(null)}
                  className="sb-btn sb-btn-steel w-full mt-2 py-2"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CurrencyChip({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 flex-1"
      style={{
        background: 'linear-gradient(180deg, #2c1810 0%, var(--sb-leather-dark) 100%)',
        border: `1.5px solid ${accent}`,
        borderRadius: '4px',
        boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.15)',
      }}
    >
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="sb-display text-[8px] opacity-65" style={{ letterSpacing: '0.2em', color: 'var(--sb-gold-light)' }}>
          {label}
        </div>
        <div className="sb-mono font-bold text-sm" style={{ color: accent }}>
          {value.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
