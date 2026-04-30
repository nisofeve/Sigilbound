// Sigilbound combat shop — daily-rotating Action/Tactic vendor.
// Heraldic mobile-portrait FTP layout.

import { useEffect, useMemo, useState } from 'react';
import {
  type ActionCardDef,
  type TacticCardDef,
} from '@engine/index';
import {
  buyCombatShopEntry,
  getCombatShopRoll,
  rolloverCombatShop,
  type Profile,
} from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

export default function CombatShopScreen({ profile, onProfileChange, onBack }: Props) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [msg, setMsg] = useState<string | null>(null);

  // Roll over the shop tracking on mount if today is fresh.
  useEffect(() => {
    const next = rolloverCombatShop(profile, today);
    if (next !== profile) onProfileChange(next);
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  const entries = useMemo(() => getCombatShopRoll(today), [today]);

  function flash(text: string) {
    setMsg(text);
    setTimeout(() => setMsg(null), 1800);
  }

  function buy(entryIdx: number, payWith: 'gold' | 'crystals') {
    const entry = entries[entryIdx];
    if (!entry) return;
    const r = buyCombatShopEntry(profile, entry, payWith);
    if (!r.ok) {
      flash(r.reason);
      return;
    }
    onProfileChange(r.profile);
    flash(`✓ ${entry.def.name} purchased`);
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
        <div className="sb-mono text-[9px] ml-auto opacity-65 text-right" style={{ color: 'var(--sb-gold-light)' }}>
          REFRESHES<br />
          {today}
        </div>
      </div>

      {/* Stock — scrollable */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-3 sb-fade-up">
        <div className="flex flex-col gap-3">
          {entries.map((entry, idx) => {
            const bought = profile.combatShopBoughtIds.includes(entry.cardId);
            const isAction = 'damageType' in entry.def;
            const def = entry.def;
            const canGold = !bought && profile.bankCoins >= entry.goldPrice;
            const canCrystals = !bought && profile.gems >= entry.crystalPrice;
            return (
              <div
                key={`${entry.cardId}-${idx}`}
                className="flex items-stretch gap-3 px-3 py-3 relative"
                style={{
                  background: 'linear-gradient(160deg, rgba(20,14,8,0.85) 0%, rgba(10,8,5,0.92) 100%)',
                  border: '1px solid rgba(255,235,180,0.18)',
                  borderRadius: '8px',
                  color: 'var(--sb-gold-light)',
                  opacity: bought ? 0.55 : 1,
                  boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.08)',
                }}
              >
                <div style={{ flexShrink: 0 }}>
                  <CombatCard card={def as ActionCardDef | TacticCardDef} size="sm" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="sb-display font-bold text-sm" style={{ color: '#f1f5f9', letterSpacing: '0.04em' }}>
                    {def.name}
                  </div>
                  <div className="text-[11px] opacity-85 leading-snug mt-1" style={{ color: '#cbd5e1' }}>
                    {isAction
                      ? `${(def as ActionCardDef).damage} damage · ${(def as ActionCardDef).charge}t charge · ${(def as ActionCardDef).cost} stamina`
                      : (def as TacticCardDef).description}
                  </div>
                  <div className="sb-mono text-[10px] mt-1 opacity-70" style={{ letterSpacing: '0.1em' }}>
                    OWNED {profile.combatCardInventory[entry.cardId] ?? 0}
                  </div>

                  {bought ? (
                    <div
                      className="sb-display text-center mt-auto py-1.5"
                      style={{
                        background: 'rgba(74,222,128,0.15)',
                        border: '1px solid rgba(74,222,128,0.4)',
                        borderRadius: '4px',
                        color: '#86efac',
                        fontSize: '10px',
                        letterSpacing: '0.18em',
                      }}
                    >
                      ✓ PURCHASED
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-auto pt-2">
                      <button
                        onClick={() => buy(idx, 'gold')}
                        disabled={!canGold}
                        className="sb-btn sb-btn-gold flex-1"
                        style={{ fontSize: '11px', padding: '7px 8px', letterSpacing: '0.08em' }}
                      >
                        💰 {entry.goldPrice.toLocaleString()}
                      </button>
                      <button
                        onClick={() => buy(idx, 'crystals')}
                        disabled={!canCrystals}
                        className="sb-btn"
                        style={{
                          fontSize: '11px',
                          padding: '7px 8px',
                          letterSpacing: '0.08em',
                          flex: 1,
                          background: 'linear-gradient(180deg, #1d4ed8 0%, #1e3a8a 100%)',
                          border: '2px solid #93c5fd',
                        }}
                      >
                        💎 {entry.crystalPrice}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky bottom flash messages */}
      {msg && (
        <div
          className="relative z-20 px-3 pb-2"
        >
          <div
            className="sb-display text-center px-3 py-2"
            style={{
              fontSize: '11px',
              letterSpacing: '0.18em',
              background: msg.startsWith('✓')
                ? 'rgba(74,222,128,0.25)'
                : 'rgba(220,38,38,0.25)',
              border: msg.startsWith('✓')
                ? '1.5px solid #4ade80'
                : '1.5px solid var(--sb-crimson-light)',
              borderRadius: '3px',
              color: msg.startsWith('✓') ? '#86efac' : '#fecaca',
            }}
          >
            {msg.toUpperCase()}
          </div>
        </div>
      )}

      <div
        className="relative z-20 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className="sb-mono text-center text-[10px] opacity-65"
          style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.18em' }}
        >
          ✦ {entries.filter(e => !profile.combatShopBoughtIds.includes(e.cardId)).length}/{entries.length} ITEMS REMAINING ✦
        </div>
      </div>
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
