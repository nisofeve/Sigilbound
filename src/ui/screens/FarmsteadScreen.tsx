// Sigilbound Stronghold — visual upgrade tree screen.
// 5 zone columns side by side, T1→T5 nodes with connector lines.
// Locked nodes are dimmed; owned nodes glow with zone accent color.

import { useState } from 'react';
import { allUpgrades, canBuy, type Upgrade, type UpgradeZone } from '@engine/index';
import { buyUpgrade, type Profile } from '@storage/index';

interface Props {
  profile: Profile;
  onProfileChange: (next: Profile) => void;
  onBack: () => void;
}

const ACTIVE_ZONES: UpgradeZone[] = ['armory', 'sanctum', 'library', 'forge', 'shrine'];

const zoneMeta: Record<string, {
  name: string; icon: string; accent: string; accentDim: string;
  tint: string; tintStrong: string; description: string;
}> = {
  armory:  {
    name: 'Armory',  icon: '⚔️',
    accent: '#fca5a5', accentDim: '#7f1d1d',
    tint: 'rgba(185,28,28,0.18)',  tintStrong: 'rgba(185,28,28,0.45)',
    description: 'Combat power',
  },
  sanctum: {
    name: 'Sanctum', icon: '🛡️',
    accent: '#86efac', accentDim: '#14532d',
    tint: 'rgba(22,163,74,0.14)',  tintStrong: 'rgba(22,163,74,0.40)',
    description: 'Defence & survival',
  },
  library: {
    name: 'Library', icon: '📚',
    accent: '#fde68a', accentDim: '#78350f',
    tint: 'rgba(217,119,6,0.18)',  tintStrong: 'rgba(217,119,6,0.42)',
    description: 'Card flow',
  },
  forge:   {
    name: 'Forge',   icon: '⚒️',
    accent: '#cbd5e1', accentDim: '#334155',
    tint: 'rgba(71,85,105,0.18)',  tintStrong: 'rgba(71,85,105,0.42)',
    description: 'Equipment & elements',
  },
  shrine:  {
    name: 'Shrine',  icon: '✨',
    accent: '#c4b5fd', accentDim: '#4c1d95',
    tint: 'rgba(109,40,217,0.18)', tintStrong: 'rgba(109,40,217,0.42)',
    description: 'Mastery & perks',
  },
};

// Build prerequisite chains within a zone: map each upgrade id to its chain
// predecessor. Returns ordered tiers per chain (root at index 0).
function buildChains(upgrades: Upgrade[]): Upgrade[][] {
  const byId = new Map(upgrades.map(u => [u.id, u]));
  // Roots: no prerequisite OR prerequisite is in another zone
  const roots = upgrades.filter(u => !u.prerequisite || !byId.has(u.prerequisite!));
  const chains: Upgrade[][] = [];
  for (const root of roots) {
    const chain: Upgrade[] = [root];
    let cur: Upgrade = root;
    // Follow the single child (linear chains only)
    let next = upgrades.find(u => u.prerequisite === cur.id);
    while (next) {
      chain.push(next);
      cur = next;
      next = upgrades.find(u => u.prerequisite === cur.id);
    }
    chains.push(chain);
  }
  return chains;
}

interface NodeProps {
  upg: Upgrade;
  owned: boolean;
  buyable: boolean;
  locked: boolean;
  accent: string;
  accentDim: string;
  tintStrong: string;
  onBuy: () => void;
  onInfo: (upg: Upgrade) => void;
}

function UpgradeNode({ upg, owned, buyable, locked, accent, accentDim, tintStrong, onBuy, onInfo }: NodeProps) {
  const isNoOp = upg.effect.type === 'noop';

  const borderColor = owned ? accent : buyable ? accent + 'aa' : locked ? accentDim : 'rgba(120,100,80,0.35)';
  const bgColor = owned
    ? tintStrong
    : buyable
      ? 'rgba(0,0,0,0.55)'
      : 'rgba(0,0,0,0.45)';
  const opacity = locked && !owned ? 0.38 : 1;
  const glowColor = owned ? accent : buyable ? accent + '55' : 'transparent';

  return (
    <div
      style={{
        position: 'relative',
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        padding: '8px 9px',
        opacity,
        boxShadow: owned
          ? `0 0 14px ${glowColor}, inset 0 1px 0 rgba(255,235,180,0.12)`
          : buyable
            ? `0 0 8px ${glowColor}, inset 0 1px 0 rgba(255,235,180,0.06)`
            : 'inset 0 1px 0 rgba(255,235,180,0.04)',
        cursor: locked || owned ? 'default' : 'pointer',
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
      onClick={() => !locked && !owned && onInfo(upg)}
    >
      {/* Tier pip */}
      <div style={{
        position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
        width: 18, height: 18,
        background: owned ? accent : buyable ? accent + 'cc' : accentDim,
        border: `1.5px solid ${owned ? '#fff8' : 'rgba(255,255,255,0.2)'}`,
        borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700,
        color: '#1a0f0a',
        fontFamily: 'var(--sb-font-display)',
        boxShadow: owned ? `0 0 8px ${accent}` : 'none',
        zIndex: 2,
      }}>
        {upg.tier}
      </div>

      {/* Name row */}
      <div style={{
        fontFamily: 'var(--sb-font-display)',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: owned ? accent : 'var(--sb-gold-light)',
        marginBottom: 3,
        marginTop: 4,
        textAlign: 'center',
        lineHeight: 1.25,
      }}>
        {owned && <span style={{ marginRight: 3, fontSize: 9 }}>✓</span>}
        {upg.name}
        {isNoOp && !owned && (
          <span style={{ fontSize: 8, opacity: 0.45, marginLeft: 4, fontFamily: 'var(--sb-font-mono)' }}>SOON</span>
        )}
      </div>

      {/* Description */}
      <div style={{
        fontSize: 9.5,
        color: 'var(--sb-parchment)',
        opacity: 0.82,
        textAlign: 'center',
        lineHeight: 1.3,
        marginBottom: owned ? 0 : 5,
      }}>
        {upg.description}
      </div>

      {/* Buy button / owned state */}
      {!owned && (
        <button
          onClick={e => { e.stopPropagation(); if (buyable) onBuy(); }}
          disabled={!buyable}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 3,
            width: '100%',
            padding: '4px 6px',
            fontSize: 10,
            fontFamily: 'var(--sb-font-display)',
            fontWeight: 700,
            letterSpacing: '0.05em',
            borderRadius: 3,
            cursor: buyable ? 'pointer' : 'not-allowed',
            background: buyable
              ? `linear-gradient(180deg, ${accent} 0%, ${accentDim} 100%)`
              : 'rgba(0,0,0,0.4)',
            border: `1px solid ${buyable ? accent : 'rgba(120,100,80,0.3)'}`,
            color: buyable ? '#1a0f0a' : 'rgba(255,255,255,0.25)',
            boxShadow: buyable ? `inset 0 1px 0 rgba(255,255,255,0.35)` : 'none',
          }}
        >
          {locked ? '🔒' : '💰'} {upg.cost.toLocaleString()}
        </button>
      )}
    </div>
  );
}

// Vertical connector between two nodes in a chain
function ChainConnector({ owned, buyable, accent, accentDim }: {
  owned: boolean; buyable: boolean; accent: string; accentDim: string;
}) {
  const color = owned ? accent : buyable ? accent + '77' : accentDim + '66';
  const solid = owned || buyable;
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      height: 20,
      position: 'relative',
    }}>
      <div style={{
        width: 2,
        height: '100%',
        background: solid ? color : `repeating-linear-gradient(to bottom, ${color} 0px, ${color} 4px, transparent 4px, transparent 8px)`,
        boxShadow: owned ? `0 0 6px ${accent}` : 'none',
        borderRadius: 1,
      }} />
      <div style={{
        position: 'absolute',
        bottom: -4,
        width: 0,
        height: 0,
        borderLeft: '4px solid transparent',
        borderRight: '4px solid transparent',
        borderTop: `5px solid ${color}`,
        filter: owned ? `drop-shadow(0 0 4px ${accent})` : 'none',
      }} />
    </div>
  );
}

// Info popup for upgrade details
function UpgradeInfoPopup({ upg, owned, buyable, locked, accent, onBuy, onClose }: {
  upg: Upgrade; owned: boolean; buyable: boolean; locked: boolean;
  accent: string; onBuy: () => void; onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #2c1810 0%, #1a0f0a 100%)',
          border: `2px solid ${accent}`,
          borderRadius: 8,
          padding: '20px 22px',
          maxWidth: 320,
          width: '100%',
          boxShadow: `0 0 30px ${accent}44, var(--sb-shadow-md)`,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{
            fontFamily: 'var(--sb-font-display)',
            fontSize: 15, fontWeight: 700,
            color: accent, letterSpacing: '0.08em',
          }}>
            {upg.name}
          </div>
          <div style={{
            fontFamily: 'var(--sb-font-display)',
            fontSize: 10, opacity: 0.6,
            color: 'var(--sb-gold-light)',
          }}>T{upg.tier}</div>
        </div>

        <div style={{
          fontSize: 12,
          color: 'var(--sb-parchment)',
          lineHeight: 1.5,
          marginBottom: 16,
        }}>
          {upg.description}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {!owned && (
            <button
              onClick={() => { onBuy(); onClose(); }}
              disabled={!buyable}
              className={buyable ? 'sb-btn sb-btn-gold' : 'sb-btn sb-btn-dark'}
              style={{
                flex: 1, fontSize: 12, padding: '8px 12px',
                opacity: buyable ? 1 : 0.45,
                cursor: buyable ? 'pointer' : 'not-allowed',
              }}
            >
              {locked ? '🔒 LOCKED' : `💰 ${upg.cost.toLocaleString()}`}
            </button>
          )}
          {owned && (
            <div style={{
              flex: 1, textAlign: 'center',
              fontFamily: 'var(--sb-font-display)',
              fontSize: 12, color: '#4ade80',
              padding: '8px 0',
            }}>✓ FORGED</div>
          )}
          <button
            onClick={onClose}
            className="sb-btn sb-btn-dark"
            style={{ fontSize: 12, padding: '8px 14px' }}
          >✕</button>
        </div>
      </div>
    </div>
  );
}

export default function FarmsteadScreen({ profile, onProfileChange, onBack }: Props) {
  const [infoUpg, setInfoUpg] = useState<Upgrade | null>(null);
  const ownedSet = new Set(profile.upgradesOwned);
  const all = allUpgrades();

  // Group and build chains per zone
  const grouped: Record<string, Upgrade[]> = {};
  for (const z of ACTIVE_ZONES) grouped[z] = [];
  for (const u of all) {
    if (grouped[u.zone]) grouped[u.zone].push(u);
  }

  function handleBuy(u: Upgrade) {
    const next = buyUpgrade(profile, u.id, u.cost);
    onProfileChange(next);
  }

  const activeInfo = infoUpg;
  const infoOwned = activeInfo ? ownedSet.has(activeInfo.id) : false;
  const infoBuyable = activeInfo ? canBuy(activeInfo, ownedSet, profile.bankCoins) : false;
  const infoLocked = activeInfo
    ? !!(activeInfo.prerequisite && !ownedSet.has(activeInfo.prerequisite))
    : false;

  return (
    <div
      className="sb-bg sb-bg-stone relative h-full w-full overflow-hidden safe-top safe-bottom"
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      {/* Top bar */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px 6px',
        borderBottom: '1px solid rgba(255,235,180,0.1)',
        zIndex: 10,
      }}>
        <button onClick={onBack} className="sb-chip" style={{ cursor: 'pointer', padding: '6px 12px', fontSize: '11px' }}>
          ← HOME
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 22, lineHeight: 1, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))' }}>🏰</div>
          <div
            className="sb-display"
            style={{
              fontSize: 'clamp(14px, 3.5vw, 20px)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.2em',
              textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 0 12px rgba(251,191,36,0.25)',
            }}
          >
            STRONGHOLD
          </div>
        </div>

        <div
          className="sb-chip sb-chip-gold flex items-center gap-2 px-3 py-1.5"
          style={{ fontSize: '13px' }}
        >
          <span className="text-base">💰</span>
          <span className="sb-mono font-bold">{profile.bankCoins.toLocaleString()}</span>
        </div>
      </div>

      {/* Subtitle */}
      <div style={{
        flexShrink: 0,
        textAlign: 'center',
        padding: '4px 0 6px',
        fontFamily: 'var(--sb-font-mono)',
        fontSize: 9,
        opacity: 0.55,
        letterSpacing: '0.15em',
        color: 'var(--sb-gold-light)',
      }}>
        PERMANENT UPGRADES · CARRIED INTO EVERY BATTLE
      </div>

      {/* Zone column headers */}
      <div style={{
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 6,
        padding: '0 8px 6px',
        zIndex: 5,
      }}>
        {ACTIVE_ZONES.map(zone => {
          const meta = zoneMeta[zone];
          const ownedCount = grouped[zone].filter(u => ownedSet.has(u.id)).length;
          const total = grouped[zone].length;
          return (
            <div
              key={zone}
              style={{
                background: `linear-gradient(180deg, ${meta.tintStrong} 0%, ${meta.tint} 100%)`,
                border: `1.5px solid ${meta.accent}55`,
                borderRadius: '6px 6px 0 0',
                padding: '7px 4px 5px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 3 }}>{meta.icon}</div>
              <div style={{
                fontFamily: 'var(--sb-font-display)',
                fontSize: 'clamp(8px, 1.8vw, 11px)',
                color: meta.accent,
                letterSpacing: '0.1em',
                fontWeight: 700,
              }}>
                {meta.name.toUpperCase()}
              </div>
              <div style={{
                fontFamily: 'var(--sb-font-mono)',
                fontSize: 9,
                color: meta.accent,
                opacity: 0.7,
                marginTop: 2,
              }}>
                {ownedCount}/{total}
              </div>
            </div>
          );
        })}
      </div>

      {/* Upgrade tree grid — horizontally scrollable on very small screens */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'auto',
        padding: '0 8px 16px',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 6,
          minWidth: 300,
          alignItems: 'start',
        }}>
          {ACTIVE_ZONES.map(zone => {
            const meta = zoneMeta[zone];
            const chains = buildChains(grouped[zone]);

            return (
              <div
                key={zone}
                style={{
                  background: `linear-gradient(180deg, ${meta.tint} 0%, rgba(0,0,0,0.2) 100%)`,
                  border: `1px solid ${meta.accent}33`,
                  borderTop: 'none',
                  borderRadius: '0 0 6px 6px',
                  padding: '8px 5px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {chains.map((chain, ci) => (
                  <div key={ci} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                    {chain.map((upg, ni) => {
                      const owned = ownedSet.has(upg.id);
                      const locked = !!(upg.prerequisite && !ownedSet.has(upg.prerequisite));
                      const buyable = canBuy(upg, ownedSet, profile.bankCoins);
                      const prevOwned = ni > 0 ? ownedSet.has(chain[ni - 1].id) : false;
                      const prevBuyable = ni > 0 ? canBuy(chain[ni - 1], ownedSet, profile.bankCoins) : false;

                      return (
                        <div key={upg.id}>
                          {ni > 0 && (
                            <ChainConnector
                              owned={prevOwned}
                              buyable={prevBuyable || owned}
                              accent={meta.accent}
                              accentDim={meta.accentDim}
                            />
                          )}
                          <UpgradeNode
                            upg={upg}
                            owned={owned}
                            buyable={buyable}
                            locked={locked}
                            accent={meta.accent}
                            accentDim={meta.accentDim}
                            tintStrong={meta.tintStrong}
                            onBuy={() => handleBuy(upg)}
                            onInfo={setInfoUpg}
                          />
                        </div>
                      );
                    })}

                    {/* Separator between chains within same column */}
                    {ci < chains.length - 1 && (
                      <div style={{
                        height: 1,
                        background: `linear-gradient(90deg, transparent, ${meta.accent}30, transparent)`,
                        margin: '4px 0 2px',
                      }} />
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info popup */}
      {activeInfo && (
        <UpgradeInfoPopup
          upg={activeInfo}
          owned={infoOwned}
          buyable={infoBuyable}
          locked={infoLocked}
          accent={zoneMeta[activeInfo.zone]?.accent ?? '#fde68a'}
          onBuy={() => handleBuy(activeInfo)}
          onClose={() => setInfoUpg(null)}
        />
      )}
    </div>
  );
}
