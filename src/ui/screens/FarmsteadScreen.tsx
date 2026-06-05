// Sigilbound Stronghold — tabbed list of permanent upgrades.
// One tab per zone (Armory / Sanctum / Library / Forge / Shrine). Active
// tab shows a uniform vertical list of upgrade rows ordered by chain →
// tier so prerequisites flow top-down.

import { useEffect, useMemo, useState } from 'react';
import { allUpgrades, canBuy, levelForUpgrade, type Upgrade, type UpgradeZone } from '@engine/index';
import { levelFromXp } from '@engine/index';
import { buyUpgrade, type Profile } from '@storage/index';
import { sfx } from '@game/sfx';

const STRONGHOLD_SEEN_LEVEL_KEY = 'sb_stronghold_seen_level';

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

// Build prerequisite-rooted display order: walk roots, then their children
// in chain sequence. This preserves the "tier 1 of chain A, then tier 2 of
// chain A, …, then chain B" reading order so a list view groups related
// upgrades naturally.
function chainOrderedUpgrades(upgrades: Upgrade[]): Upgrade[] {
  const byId = new Map(upgrades.map(u => [u.id, u]));
  const roots = upgrades.filter(u => !u.prerequisite || !byId.has(u.prerequisite!));
  const out: Upgrade[] = [];
  for (const root of roots) {
    let cur: Upgrade | undefined = root;
    while (cur) {
      out.push(cur);
      cur = upgrades.find(u => u.prerequisite === cur!.id);
    }
  }
  // Append any orphans that weren't reached (shouldn't happen but defensive).
  for (const u of upgrades) if (!out.includes(u)) out.push(u);
  return out;
}

// ─── Zone list — uniform vertical list of upgrade rows ─────────────────────

function ZoneList({
  zone, upgrades, ownedSet, bankCoins, playerLevel, onBuy, onInfo,
}: {
  zone: UpgradeZone;
  upgrades: Upgrade[];
  ownedSet: Set<string>;
  bankCoins: number;
  playerLevel: number;
  onBuy: (u: Upgrade) => void;
  onInfo: (u: Upgrade) => void;
}) {
  const meta = zoneMeta[zone];
  const all = useMemo(() => chainOrderedUpgrades(upgrades), [upgrades]);
  const visible = useMemo(() => all.filter(u => levelForUpgrade(u) <= playerLevel), [all, playerLevel]);
  const hiddenCount = all.length - visible.length;
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 6,
        padding: '6px 0 4px',
      }}
    >
      {visible.map(upg => {
        const owned = ownedSet.has(upg.id);
        const locked = !!(upg.prerequisite && !ownedSet.has(upg.prerequisite));
        const buyable = !owned && !locked && bankCoins >= upg.cost;
        return (
          <UpgradeRow
            key={upg.id}
            upg={upg}
            owned={owned}
            buyable={buyable}
            locked={locked}
            accent={meta.accent}
            accentDim={meta.accentDim}
            tintStrong={meta.tintStrong}
            onBuy={() => onBuy(upg)}
            onInfo={() => onInfo(upg)}
          />
        );
      })}
      {hiddenCount > 0 && (
        <div style={{
          textAlign: 'center',
          padding: '8px 0 4px',
          fontSize: 10,
          opacity: 0.45,
          color: 'var(--sb-gold-light)',
          letterSpacing: '0.12em',
          fontFamily: 'var(--sb-font-mono)',
        }}>
          🔒 {hiddenCount} MORE UNLOCK AS YOU LEVEL UP
        </div>
      )}
    </div>
  );
}

// ─── UpgradeRow — one uniform list entry ───────────────────────────────────

interface RowProps {
  upg: Upgrade;
  owned: boolean;
  buyable: boolean;
  locked: boolean;
  accent: string;
  accentDim: string;
  tintStrong: string;
  onBuy: () => void;
  onInfo: () => void;
}

function UpgradeRow({ upg, owned, buyable, locked, accent, accentDim, tintStrong, onBuy, onInfo }: RowProps) {
  const isNoOp = upg.effect.type === 'noop';
  const borderColor = owned ? accent : buyable ? accent + 'aa' : locked ? accentDim : 'rgba(120,100,80,0.35)';
  const bgColor = owned
    ? tintStrong
    : buyable
      ? 'rgba(0,0,0,0.55)'
      : 'rgba(0,0,0,0.42)';
  const opacity = locked && !owned ? 0.5 : 1;
  return (
    <div
      onClick={onInfo}
      style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr auto',
        alignItems: 'center',
        gap: 10,
        background: bgColor,
        border: `1.5px solid ${borderColor}`,
        borderRadius: 6,
        padding: '8px 10px',
        opacity,
        cursor: 'pointer',
        boxShadow: owned
          ? `0 0 8px ${accent}66, inset 0 1px 0 rgba(255,235,180,0.1)`
          : buyable
            ? `0 0 6px ${accent}33, inset 0 1px 0 rgba(255,235,180,0.06)`
            : 'inset 0 1px 0 rgba(255,235,180,0.04)',
        transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
      }}
    >
      {/* Tier pip */}
      <div
        style={{
          width: 32, height: 32,
          borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: owned
            ? `linear-gradient(180deg, ${accent} 0%, ${accentDim} 100%)`
            : buyable
              ? `linear-gradient(180deg, ${accent}aa 0%, ${accentDim} 100%)`
              : 'linear-gradient(180deg, rgba(60,40,20,0.8) 0%, rgba(30,20,10,0.9) 100%)',
          border: `1.5px solid ${owned ? '#fff7' : accent + '55'}`,
          color: owned || buyable ? '#1a0f0a' : '#94896f',
          fontFamily: 'var(--sb-font-display)',
          fontSize: 12, fontWeight: 700,
          boxShadow: owned ? `0 0 10px ${accent}aa` : 'none',
        }}
      >
        {upg.tier}
      </div>

      {/* Center: name + description */}
      <div style={{ minWidth: 0 }}>
        <div
          className="sb-display"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.04em',
            color: owned ? accent : 'var(--sb-gold-light)',
            lineHeight: 1.2,
            marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {owned && <span style={{ marginRight: 4, fontSize: 10 }}>✓</span>}
          {upg.name}
          {isNoOp && !owned && (
            <span className="sb-mono" style={{ fontSize: 8, opacity: 0.5, marginLeft: 6, letterSpacing: '0.1em' }}>SOON</span>
          )}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--sb-parchment)',
            opacity: 0.78,
            lineHeight: 1.3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {upg.description}
        </div>
      </div>

      {/* Right: buy / owned state */}
      <div style={{ flexShrink: 0 }}>
        {owned ? (
          <span
            className="sb-mono"
            style={{
              padding: '4px 8px', borderRadius: 999,
              fontSize: 9,
              background: 'rgba(34,197,94,0.18)',
              border: '1px solid rgba(74,222,128,0.5)',
              color: '#86efac',
              letterSpacing: '0.12em', fontWeight: 700,
            }}
          >
            FORGED
          </span>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); if (buyable) onBuy(); }}
            disabled={!buyable}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '6px 10px',
              fontSize: 11,
              fontFamily: 'var(--sb-font-display)',
              fontWeight: 700,
              letterSpacing: '0.05em',
              borderRadius: 4,
              cursor: buyable ? 'pointer' : 'not-allowed',
              background: buyable
                ? `linear-gradient(180deg, ${accent} 0%, ${accentDim} 100%)`
                : 'rgba(0,0,0,0.4)',
              border: `1px solid ${buyable ? accent : 'rgba(120,100,80,0.35)'}`,
              color: buyable ? '#1a0f0a' : 'rgba(255,255,255,0.3)',
              boxShadow: buyable ? `inset 0 1px 0 rgba(255,255,255,0.3)` : 'none',
              minWidth: 76,
              justifyContent: 'center',
            }}
          >
            {locked ? '🔒' : '💰'} {upg.cost.toLocaleString()}
          </button>
        )}
      </div>
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
  const [activeZone, setActiveZone] = useState<UpgradeZone>('armory');
  const ownedSet = new Set(profile.upgradesOwned);
  const all = allUpgrades();
  const playerLevel = levelFromXp(profile.playerXp);

  // Mark stronghold as seen at current level — clears the home-screen badge.
  useEffect(() => {
    try { localStorage.setItem(STRONGHOLD_SEEN_LEVEL_KEY, String(playerLevel)); } catch { /* ignore */ }
  }, [playerLevel]);

  // Group and build chains per zone
  const grouped: Record<string, Upgrade[]> = {};
  for (const z of ACTIVE_ZONES) grouped[z] = [];
  for (const u of all) {
    if (grouped[u.zone]) grouped[u.zone].push(u);
  }

  function handleBuy(u: Upgrade) {
    const next = buyUpgrade(profile, u.id, u.cost);
    // buyUpgrade returns the same profile object on failure (already owned
    // or not enough coins). Only play the unlock SFX on a real purchase —
    // detected via the upgrade newly appearing in upgradesOwned.
    const succeeded = next !== profile && next.upgradesOwned.includes(u.id);
    onProfileChange(next);
    if (succeeded) sfx.upgradeUnlock();
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

      {/* Zone tab bar — tap to switch which zone's upgrades are shown */}
      <div
        role="tablist"
        style={{
          flexShrink: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
          padding: '0 8px 6px',
          zIndex: 5,
        }}
      >
        {ACTIVE_ZONES.map(zone => {
          const meta = zoneMeta[zone];
          const ownedCount = grouped[zone].filter(u => ownedSet.has(u.id)).length;
          const total = grouped[zone].length;
          const isActive = activeZone === zone;
          return (
            <button
              key={zone}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveZone(zone)}
              style={{
                background: isActive
                  ? `linear-gradient(180deg, ${meta.tintStrong} 0%, ${meta.tint} 100%)`
                  : 'rgba(0,0,0,0.4)',
                border: `1.5px solid ${isActive ? meta.accent : meta.accent + '33'}`,
                borderRadius: 6,
                padding: '7px 4px 5px',
                textAlign: 'center',
                cursor: 'pointer',
                color: 'inherit',
                transition: 'all 160ms ease',
                boxShadow: isActive
                  ? `inset 0 1px 0 rgba(255,235,180,0.18), 0 0 12px ${meta.accent}44`
                  : 'none',
                opacity: isActive ? 1 : 0.7,
              }}
            >
              <div style={{
                fontSize: 18, lineHeight: 1, marginBottom: 3,
                filter: isActive ? `drop-shadow(0 0 6px ${meta.accent}88)` : 'none',
              }}>
                {meta.icon}
              </div>
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
                opacity: 0.85,
                marginTop: 2,
              }}>
                {ownedCount}/{total}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active zone — uniform vertical upgrade list, sorted by tier */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0 8px 16px',
      }}>
        <ZoneList
          zone={activeZone}
          upgrades={grouped[activeZone]}
          ownedSet={ownedSet}
          bankCoins={profile.bankCoins}
          playerLevel={playerLevel}
          onBuy={handleBuy}
          onInfo={setInfoUpg}
        />
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
