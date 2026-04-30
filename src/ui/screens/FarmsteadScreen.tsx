// Sigilbound Stronghold — permanent upgrade screen.

import { allUpgrades, canBuy, type Upgrade, type UpgradeZone } from '@engine/index';
import { buyUpgrade, type Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

// Only the 5 active zones are shown in the UI. Legacy zones from old save
// data are silently skipped when rendering.
const ACTIVE_ZONES: UpgradeZone[] = ['armory', 'sanctum', 'library', 'forge', 'shrine'];

const zoneMeta: Record<string, { name: string; icon: string; accent: string; tint: string; description: string }> = {
  armory:  { name: 'Armory',   icon: '⚔️',  accent: '#fca5a5', tint: 'rgba(185,28,28,0.30)',  description: 'Combat power. Sigil slots, attack, crit, combo damage.' },
  sanctum: { name: 'Sanctum',  icon: '🛡️',  accent: '#86efac', tint: 'rgba(22,163,74,0.20)',  description: 'Defence & survival. Max HP, block, regen, aegis, revive.' },
  library: { name: 'Library',  icon: '📚',  accent: '#fde68a', tint: 'rgba(217,119,6,0.25)',  description: 'Card flow. Hand size, stamina, draft offers, combo cascade.' },
  forge:   { name: 'Forge',    icon: '⚒️',  accent: '#cbd5e1', tint: 'rgba(71,85,105,0.25)',  description: 'Equipment & elements. Resistances, damage bonuses, gold.' },
  shrine:  { name: 'Shrine',   icon: '✨',  accent: '#c4b5fd', tint: 'rgba(109,40,217,0.25)', description: 'Mastery. Perk & talent slots, combo master, astral convergence.' },
};

export default function FarmsteadScreen({ profile, onProfileChange, onBack }: Props) {
  const ownedSet = new Set(profile.upgradesOwned);
  const all = allUpgrades();
  const grouped: Record<string, Upgrade[]> = {};
  for (const z of ACTIVE_ZONES) grouped[z] = [];
  for (const u of all) {
    if (grouped[u.zone]) grouped[u.zone].push(u);
  }

  function handleBuy(u: Upgrade) {
    const next = buyUpgrade(profile, u.id, u.cost);
    onProfileChange(next);
  }

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full overflow-y-auto safe-top safe-bottom">
      <div className="relative z-10 max-w-3xl mx-auto px-3 sm:px-5 py-4 sb-fade-up">

        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
            ← HOME
          </button>
          <div
            className="sb-chip sb-chip-gold flex items-center gap-2 px-3 py-1.5"
            style={{ fontSize: '13px' }}
          >
            <span className="text-base">💰</span>
            <span className="sb-mono font-bold">{profile.bankCoins.toLocaleString()}</span>
            <span className="opacity-65 text-[9px] hidden sm:inline">GOLD</span>
          </div>
        </div>

        {/* Title block */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))' }}>🏰</div>
          <h1
            className="sb-display"
            style={{
              fontSize: 'clamp(28px, 6vw, 42px)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.2em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(251,191,36,0.3)',
            }}
          >
            STRONGHOLD
          </h1>
          <div className="sb-mono text-[10px] mt-2 opacity-70 tracking-widest" style={{ color: 'var(--sb-gold-light)' }}>
            PERMANENT UPGRADES · CARRIED INTO EVERY BATTLE
          </div>
        </div>

        {ACTIVE_ZONES.map((zone, zi) => {
          const meta = zoneMeta[zone];
          const ownedCount = grouped[zone].filter(u => ownedSet.has(u.id)).length;
          return (
            <div key={zone} className="mb-5 sb-fade-up" style={{ animationDelay: `${0.05 + zi * 0.05}s` }}>
              <div
                className="px-4 py-3"
                style={{
                  background: `linear-gradient(180deg, ${meta.tint} 0%, rgba(0,0,0,0.4) 100%)`,
                  border: `2px solid ${meta.accent}`,
                  borderRadius: '4px',
                  boxShadow: `inset 0 1px 0 rgba(255,235,180,0.15), 0 0 14px ${meta.accent}33, var(--sb-shadow-md)`,
                }}
              >
                {/* Zone header */}
                <div className="flex items-center gap-3 mb-3 pb-2" style={{ borderBottom: '1px solid rgba(255,235,180,0.15)' }}>
                  <div className="text-3xl flex-shrink-0" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
                    {meta.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="sb-display text-xl" style={{ color: 'var(--sb-gold-light)', letterSpacing: '0.15em' }}>
                      {meta.name.toUpperCase()}
                    </div>
                    <div className="text-[10px] opacity-75 italic" style={{ color: 'var(--sb-parchment)' }}>
                      {meta.description}
                    </div>
                  </div>
                  <div
                    className="sb-mono text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: 'rgba(0,0,0,0.5)',
                      border: `1px solid ${meta.accent}`,
                      color: meta.accent,
                    }}
                  >
                    {ownedCount}/{grouped[zone].length}
                  </div>
                </div>

                {/* Upgrade rows */}
                <div className="space-y-2">
                  {grouped[zone].sort((a, b) => a.tier - b.tier).map(upg => {
                    const owned = ownedSet.has(upg.id);
                    const buyable = canBuy(upg, ownedSet, profile.bankCoins);
                    const prereqMissing = upg.prerequisite && !ownedSet.has(upg.prerequisite);
                    const isNoOp = upg.effect.type === 'noop';

                    return (
                      <div
                        key={upg.id}
                        className="flex items-center gap-3 p-2.5"
                        style={{
                          background: owned
                            ? 'linear-gradient(180deg, rgba(74,222,128,0.18) 0%, rgba(34,89,46,0.18) 100%)'
                            : 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.6) 100%)',
                          border: `1.5px solid ${owned ? '#4ade80' : 'var(--sb-bronze-dark)'}`,
                          borderRadius: '3px',
                          color: 'var(--sb-gold-light)',
                          boxShadow: owned ? '0 0 8px rgba(74,222,128,0.25)' : 'inset 0 1px 0 rgba(255,235,180,0.05)',
                        }}
                      >
                        {/* Tier badge */}
                        <div
                          className="sb-display text-[11px] w-9 h-9 flex items-center justify-center flex-shrink-0"
                          style={{
                            background: `linear-gradient(180deg, ${meta.accent}, ${meta.accent}99)`,
                            color: '#1a0f0a',
                            borderRadius: '50%',
                            border: '2px solid var(--sb-bronze-dark)',
                            fontWeight: 700,
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                          }}
                        >
                          T{upg.tier}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="sb-display text-[13px] font-bold flex items-center gap-2" style={{ letterSpacing: '0.05em' }}>
                            {upg.name}
                            {isNoOp && !owned && (
                              <span className="text-[9px] opacity-50 italic sb-mono">SOON</span>
                            )}
                          </div>
                          <div className="text-[11px] opacity-80 leading-snug" style={{ color: 'var(--sb-parchment)' }}>
                            {upg.description}
                          </div>
                          {prereqMissing && (
                            <div className="text-[10px] mt-1 sb-mono" style={{ color: '#fca5a5' }}>
                              🔒 NEEDS: {all.find(u => u.id === upg.prerequisite)?.name}
                            </div>
                          )}
                        </div>

                        {owned ? (
                          <span
                            className="sb-display text-[11px] px-3 py-1.5 flex-shrink-0"
                            style={{
                              background: 'linear-gradient(180deg, #4ade80 0%, #16a34a 100%)',
                              color: '#0a2a14',
                              border: '1.5px solid #86efac',
                              borderRadius: '3px',
                              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                              letterSpacing: '0.1em',
                            }}
                          >
                            ✓ FORGED
                          </span>
                        ) : (
                          <button
                            onClick={() => handleBuy(upg)}
                            disabled={!buyable}
                            className="sb-btn sb-btn-gold flex-shrink-0"
                            style={{ fontSize: '11px', padding: '8px 12px' }}
                          >
                            💰 {upg.cost.toLocaleString()}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
