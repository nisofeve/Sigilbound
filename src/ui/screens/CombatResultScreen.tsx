// Sigilbound combat result — mobile portrait layout.
//
//   ┌────────────────────────────────────┐
//   │       ⚔  VICTORY                   │  ← banner
//   │       ★ ★ ★                        │
//   │       Stage 1                      │
//   ├────────────────────────────────────┤
//   │ scrollable stats column            │
//   │  [enemies][damage]                 │
//   │  [taken][hp end]                   │
//   │  damage by type bars               │
//   │  combo log                         │
//   ├────────────────────────────────────┤
//   │ [HOME] [REPLAY] [▶ NEXT]           │  ← sticky CTA dock
//   └────────────────────────────────────┘

import { useEffect, useRef, useState } from 'react';
import type { BattleRunner, CombatStageDef, ItemDrop } from '@engine/index';
import { allActions, allTactics, allEquipment, allTalents } from '@engine/index';
import type { CombatClearOutcome } from '@storage/index';
import { CombatCard } from '@ui/components/CombatCard';
import { EquipmentCard } from '@ui/components/EquipmentCard';
import { TalentCard } from '@ui/components/TalentCard';
import { CardDetailModal } from '@ui/components/CardDetailBody';
import type { ActionCardDef, TacticCardDef, EquipmentDef, Perk } from '@engine/index';
import { sfx } from '@game/sfx';

// Shape consumed by CardDetailModal. Mirrored locally so this file stays
// self-contained for the long-press drill-down on item drops.
type DetailTarget =
  | { kind: 'battle'; card: ActionCardDef | TacticCardDef }
  | { kind: 'equipment'; eq: EquipmentDef }
  | { kind: 'talent'; perk: Perk };

// 500ms hold to commit a long-press. Cancels on any pointer move/leave/up so
// scrolling the rewards list never accidentally pops the detail.
const LONG_PRESS_MS = 500;

interface Props {
  outcome: 'cleared' | 'defeated';
  stage: CombatStageDef;
  runner: BattleRunner;
  // Reward outcome from applyCombatClearToProfile. Optional so legacy
  // callers (e.g. dev tooling) still render the screen, just without
  // the chest panel.
  clearOutcome?: CombatClearOutcome;
  onReplay: () => void;
  onNext: () => void;
  onHome: () => void;
}

export default function CombatResultScreen({ outcome, stage, runner, clearOutcome, onReplay, onNext, onHome }: Props) {
  const player = runner.state.player;
  const cleared = outcome === 'cleared';

  const hpRatio = player.currentHp / Math.max(1, player.stats.maxHp);
  // Prefer the engine-computed star tier from the clear outcome so the
  // screen agrees with the rewards just granted. Fall back to the local
  // HP-ratio heuristic for callers that don't pass clearOutcome.
  const stars = clearOutcome?.stars ?? (
    !cleared ? 0 : hpRatio > 0.5 ? 3 : hpRatio > 0.25 ? 2 : 1
  );
  const isFirstClearChest = (clearOutcome?.firstClearAtTier ?? 0) > 0;

  const damageByType = player.damageDealtByType;
  const totalDmg = player.damageDealtThisStage;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom overflow-hidden">

      {/* Hero banner — locked at top, never scrolls */}
      <div className="relative z-20 flex-shrink-0 text-center pt-6 pb-4 sb-fade-up">
        <div className="text-6xl mb-2" style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.7))' }}>
          {cleared ? '⚔' : '💀'}
        </div>
        <div
          className={`inline-block px-6 py-2 ${cleared ? 'sb-banner-iron' : 'sb-banner-crimson'} sb-display`}
          style={{
            fontSize: '22px',
            letterSpacing: '0.3em',
            textShadow: '0 2px 4px rgba(0,0,0,0.7)',
          }}
        >
          {cleared ? 'VICTORY' : 'DEFEATED'}
        </div>
        {cleared && (
          <div className="mt-3 flex items-center justify-center gap-1 text-2xl">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                style={{
                  color: i < stars ? 'var(--sb-gold)' : '#3d3027',
                  textShadow: i < stars ? '0 0 12px rgba(251,191,36,0.7)' : 'none',
                  transform: `scale(${i === 1 ? 1.15 : 1})`,
                  display: 'inline-block',
                }}
              >
                {i < stars ? '★' : '☆'}
              </span>
            ))}
          </div>
        )}
        <div className="sb-mono text-[10px] opacity-70 mt-2 tracking-widest">
          STAGE {stage.number} · {stage.title.toUpperCase()}
        </div>
      </div>

      {/* Scrollable stats */}
      <div className="relative z-10 flex-1 overflow-y-auto px-3 pb-3 sb-fade-up">

        {/* 4-up stat plaques */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Stat label="Enemies Slain" value={player.enemiesDefeated} icon="⚔" />
          <Stat label="Damage Dealt" value={totalDmg} icon="💥" />
          <Stat label="Damage Taken" value={player.damageTakenThisStage} icon="🩸" />
          <Stat label="HP at End" value={`${player.currentHp}/${player.stats.maxHp}`} icon="❤" />
        </div>

        {/* Reward chest — only when something was actually granted */}
        {clearOutcome && clearOutcome.rewardsGranted.length > 0 && (
          <RewardChest
            rewards={clearOutcome.rewardsGranted}
            firstClear={isFirstClearChest}
          />
        )}

        {/* Item drops — only on first-clear */}
        {clearOutcome && clearOutcome.itemDrops && clearOutcome.itemDrops.length > 0 && (
          <ItemDropsPanel drops={clearOutcome.itemDrops} />
        )}

        {/* Newly unlocked achievements */}
        {clearOutcome && clearOutcome.achievementsUnlocked && clearOutcome.achievementsUnlocked.length > 0 && (
          <AchievementsUnlockedPanel achievements={clearOutcome.achievementsUnlocked} />
        )}

        {/* Battle Pass XP awarded */}
        {clearOutcome && clearOutcome.bpXpAwarded > 0 && (
          <div className="sb-parchment p-3 mb-3 flex items-center gap-3">
            <span style={{ fontSize: 22 }}>🏆</span>
            <div>
              <div className="sb-display" style={{ fontSize: 10, letterSpacing: '0.25em', color: 'var(--sb-gold-dark)', opacity: 0.7 }}>BATTLE PASS</div>
              <div style={{ fontFamily: "'Nunito', sans-serif", fontWeight: 800, fontSize: '0.85rem', color: '#fbbf24' }}>
                +{clearOutcome.bpXpAwarded} XP
              </div>
            </div>
          </div>
        )}

        {/* Damage breakdown */}
        {totalDmg > 0 && (
          <div className="sb-parchment p-3 mb-3">
            <div className="sb-display text-[10px] tracking-[0.3em] opacity-70 mb-2"
                 style={{ color: 'var(--sb-gold-dark)' }}>
              ✦ DAMAGE BY TYPE ✦
            </div>
            <div className="space-y-1.5">
              {(['steel', 'pierce', 'pyre', 'frost', 'arcane'] as const).map(t => {
                const v = damageByType[t] ?? 0;
                if (v === 0) return null;
                const pct = (v / totalDmg) * 100;
                return (
                  <div key={t} className="flex items-center gap-2 text-[11px]">
                    <div className="sb-display w-14 capitalize" style={{ color: typeColor(t), letterSpacing: '0.08em' }}>
                      {t}
                    </div>
                    <div
                      className="flex-1 h-3.5 overflow-hidden relative"
                      style={{
                        background: 'rgba(74,50,28,0.5)',
                        border: '1px solid var(--sb-parchment-edge)',
                        borderRadius: '2px',
                      }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${pct}%`,
                          background: `linear-gradient(180deg, ${typeColor(t)} 0%, ${typeColorDk(t)} 100%)`,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                        }}
                      />
                    </div>
                    <div className="sb-mono w-10 text-right font-bold" style={{ color: '#3d2810' }}>
                      {v}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Combo log */}
        <div
          className="grid grid-cols-3 gap-2 p-3 mb-2"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
            border: '1.5px solid var(--sb-bronze-dark)',
            borderRadius: '4px',
            boxShadow: 'inset 0 1px 0 rgba(255,200,140,0.1)',
          }}
        >
          <ComboCount icon="⛓" label="Element Chain" value={runner.state.combosTriggeredThisStage.element_chain} accent="var(--sb-crimson-light)" />
        </div>
      </div>

      {/* Sticky CTA dock — locked at bottom, never scrolls */}
      <div
        className="relative z-20 flex-shrink-0 flex gap-2 px-3 pt-2 pb-3"
        style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(15,10,7,0.85) 30%, rgba(15,10,7,0.95) 100%)',
          borderTop: '2px solid var(--sb-bronze-dark)',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.4)',
        }}
      >
        <button onClick={onHome} className="sb-btn sb-btn-steel flex-1" style={{ fontSize: '12px', padding: '12px 8px' }}>
          🏰 HOME
        </button>
        <button onClick={onReplay} className="sb-btn sb-btn-steel flex-1" style={{ fontSize: '12px', padding: '12px 8px' }}>
          🔁 REPLAY
        </button>
        {cleared && (
          <button onClick={onNext} className="sb-btn flex-1" style={{ fontSize: '12px', padding: '12px 8px' }}>
            ▶ NEXT
          </button>
        )}
      </div>
    </div>
  );
}

function RewardChest({ rewards, firstClear }: { rewards: ReadonlyArray<{ type: string; value: number }>; firstClear: boolean }) {
  const iconFor = (t: string) => {
    switch (t) {
      case 'coins':  return '🪙';
      case 'xp':     return '⭐';
      case 'gems':   return '💎';
      case 'shards': return '✨';
      default:       return '?';
    }
  };
  const labelFor = (t: string) => {
    switch (t) {
      case 'coins':  return 'COINS';
      case 'xp':     return 'XP';
      case 'gems':   return 'GEMS';
      case 'shards': return 'SHARDS';
      default:       return t.toUpperCase();
    }
  };
  const colorFor = (t: string) => {
    switch (t) {
      case 'coins':  return '#fbbf24';
      case 'xp':     return '#a78bfa';
      case 'gems':   return '#7ec4ff';
      case 'shards': return '#fde68a';
      default:       return '#fbbf24';
    }
  };

  // Stagger the reveal so the eye walks across each chip, with a chime per
  // pop-in and a chest-open swell on mount (fanfare for first-clear).
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (firstClear) sfx.fanfare();
    else            sfx.rewardOpen();
  }, [firstClear]);
  useEffect(() => {
    if (revealed >= rewards.length) return;
    const id = window.setTimeout(() => {
      setRevealed(n => Math.min(rewards.length, n + 1));
      sfx.rewardChipCommon();
    }, revealed === 0 ? 350 : 200);
    return () => window.clearTimeout(id);
  }, [revealed, rewards.length]);

  return (
    <div
      className="sb-parchment p-3 mb-3 sb-fade-up relative"
      style={{
        boxShadow: firstClear
          ? 'inset 0 0 0 1px rgba(255,235,180,0.55), 0 0 22px rgba(251,191,36,0.45), 0 4px 12px rgba(0,0,0,0.5)'
          : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="sb-display text-[10px] tracking-[0.3em] opacity-80"
             style={{ color: 'var(--sb-gold-dark)' }}>
          ⛃ {firstClear ? 'FIRST CLEAR REWARD' : 'CLEAR REWARD'}
        </div>
        {firstClear && (
          <span className="sb-display sb-pulse-crimson" style={{
            fontSize: 9, padding: '2px 6px',
            background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
            border: '1.5px solid var(--sb-gold)',
            color: 'var(--sb-gold-light)',
            letterSpacing: '0.18em',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}>NEW!</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rewards.map((r, i) => {
          const visible = i < revealed;
          const accent = colorFor(r.type);
          return (
            <div
              key={`${r.type}-${i}`}
              className={visible ? 'sb-reward-pop' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(74,50,28,0.45)',
                border: '1.5px solid var(--sb-parchment-edge)',
                borderRadius: 4,
                padding: '6px 8px',
                opacity: visible ? 1 : 0,
              }}
            >
              <div style={{ fontSize: 22, lineHeight: 1, filter: `drop-shadow(0 0 6px ${accent}aa)` }}>
                {iconFor(r.type)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-display text-[8px] tracking-[0.2em] opacity-70" style={{ color: '#3d2810' }}>
                  {labelFor(r.type)}
                </div>
                <div className="sb-mono text-base font-bold" style={{ color: '#2c1810' }}>
                  +{r.value.toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {!firstClear && (
        <div className="sb-mono text-[9px] opacity-65 mt-2 text-center" style={{ color: '#3d2810' }}>
          Replay payout — first-clear chest already claimed at this star tier.
        </div>
      )}
    </div>
  );
}

// Map rarity → SFX intensity. Common/uncommon = soft chime; rare = two-tone;
// epic/legendary/mythic = sparkly arpeggio so big drops actually feel big.
function rarityChipSfx(rarity: string) {
  if (rarity === 'epic' || rarity === 'legendary' || rarity === 'mythic') {
    sfx.rewardChipEpic();
  } else if (rarity === 'rare') {
    sfx.rewardChipRare();
  } else {
    sfx.rewardChipCommon();
  }
}

// Newly-unlocked achievements panel — celebratory list with the rarity
// color rim, icon, name, and the coins/gems each one paid out.
function AchievementsUnlockedPanel({
  achievements,
}: {
  achievements: ReadonlyArray<{ id: string; rarity: string; name: string; icon: string; rewardCoins: number; rewardGems: number }>;
}) {
  const rarityColor: Record<string, string> = {
    common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa',
    epic: '#c084fc', legendary: '#fbbf24', mythic: '#f87171',
  };
  return (
    <div
      className="mb-3 p-3"
      style={{
        background: 'linear-gradient(180deg, rgba(251,191,36,0.10) 0%, rgba(15,10,7,0.6) 100%)',
        border: '1.5px solid rgba(251,191,36,0.5)',
        borderRadius: 6,
        boxShadow: '0 0 14px rgba(251,191,36,0.2), inset 0 1px 0 rgba(253,230,138,0.15)',
      }}
    >
      <div
        className="sb-display"
        style={{ fontSize: 10, letterSpacing: '0.25em', color: '#fde68a', marginBottom: 8, textShadow: '0 0 8px rgba(251,191,36,0.5)' }}
      >
        🏆 ACHIEVEMENT{achievements.length > 1 ? 'S' : ''} UNLOCKED · {achievements.length}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {achievements.map(a => {
          const accent = rarityColor[a.rarity] ?? '#94a3b8';
          return (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 8px',
                background: 'rgba(0,0,0,0.35)',
                border: `1.5px solid ${accent}66`,
                borderRadius: 4,
                boxShadow: `0 0 6px ${accent}33`,
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{a.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="sb-display"
                  style={{ fontSize: 11, color: accent, letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {a.name}
                </div>
                <div className="sb-mono" style={{ fontSize: 9, opacity: 0.7, color: 'var(--sb-parchment)', letterSpacing: '0.1em' }}>
                  {a.rarity.toUpperCase()}
                </div>
              </div>
              <div className="sb-mono flex-shrink-0" style={{ fontSize: 10, fontWeight: 700, display: 'flex', gap: 6 }}>
                <span style={{ color: 'var(--sb-gold)' }}>💰{a.rewardCoins}</span>
                <span style={{ color: '#7dd3fc' }}>💎{a.rewardGems}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemDropsPanel({ drops }: { drops: ReadonlyArray<ItemDrop> }) {
  const actionsMap = new Map(allActions().map(c => [c.id, c]));
  const tacticsMap = new Map(allTactics().map(c => [c.id, c]));
  const equipMap   = new Map(allEquipment().map(e => [e.id, e]));
  const talentMap  = new Map(allTalents().map(t => [t.id, t]));

  const rarityColor: Record<string, string> = {
    common: '#94a3b8', uncommon: '#4ade80', rare: '#60a5fa',
    epic: '#c084fc', legendary: '#fbbf24', mythic: '#ec4899',
  };

  // Resolve each drop up-front so we can drive the staggered reveal off rarity
  // and forward a DetailTarget into the long-press popup.
  const resolved = drops.map((drop, i) => {
    let name = '?', rarity = 'common', subtitle = '';
    let visual: React.ReactNode = <div style={{ fontSize: 28 }}>📦</div>;
    let detail: DetailTarget | null = null;
    if (drop.kind === 'combat_card') {
      const card = actionsMap.get(drop.cardId) ?? tacticsMap.get(drop.cardId);
      name     = card?.name ?? drop.cardId;
      rarity   = card?.rarity ?? 'common';
      subtitle = `×${drop.count} ${drop.count > 1 ? 'copies' : 'copy'}`;
      if (card) {
        visual = <CombatCard card={card} size="xs" />;
        detail = { kind: 'battle', card };
      }
    } else if (drop.kind === 'equipment') {
      const eq = equipMap.get(drop.equipmentId);
      name     = eq?.name ?? drop.equipmentId;
      rarity   = eq?.rarity ?? 'common';
      subtitle = 'Equipment';
      if (eq) {
        visual = <EquipmentCard equipment={eq} size="xs" />;
        detail = { kind: 'equipment', eq };
      }
    } else if (drop.kind === 'talent') {
      const t = talentMap.get(drop.talentId);
      name     = t?.name ?? drop.talentId;
      rarity   = t?.rarity ?? 'common';
      subtitle = `×${drop.count} talent charge${drop.count > 1 ? 's' : ''}`;
      if (t) {
        visual = <TalentCard talent={t} size="xs" />;
        detail = { kind: 'talent', perk: t };
      }
    }
    return { key: i, name, rarity, subtitle, visual, detail };
  });

  // Long-press popup state. A single timer is reused across rows; pressing on
  // a new row before the first commit cancels and restarts the countdown.
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const pressTimer = useRef<number | null>(null);

  function clearPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }
  function startPress(target: DetailTarget | null) {
    clearPress();
    if (!target) return;
    pressTimer.current = window.setTimeout(() => {
      setDetailTarget(target);
      sfx.cardLift();
      pressTimer.current = null;
    }, LONG_PRESS_MS);
  }
  useEffect(() => () => clearPress(), []);

  // Reveal one drop at a time. Bigger gap before first drop so the player's
  // attention transitions cleanly from the chest panel above.
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (revealed >= resolved.length) return;
    const delay = revealed === 0 ? 700 : 380;
    const id = window.setTimeout(() => {
      const next = resolved[revealed];
      if (next) rarityChipSfx(next.rarity);
      setRevealed(n => Math.min(resolved.length, n + 1));
    }, delay);
    return () => window.clearTimeout(id);
  }, [revealed, resolved]);

  return (
    <div
      className="sb-parchment p-3 mb-3 sb-fade-up"
      style={{
        boxShadow: '0 0 20px rgba(251,191,36,0.35), inset 0 0 0 1.5px rgba(255,230,160,0.5)',
      }}
    >
      <div className="sb-display text-[10px] tracking-[0.3em] opacity-80 mb-3" style={{ color: 'var(--sb-gold-dark)' }}>
        🎁 ITEMS FOUND
      </div>
      <div className="flex flex-col gap-2">
        {resolved.map((d, i) => {
          const accent = rarityColor[d.rarity] ?? '#94a3b8';
          const visible = i < revealed;
          const interactive = visible && d.detail !== null;
          return (
            <div
              key={d.key}
              className={visible ? 'sb-reward-pop' : ''}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 4,
                padding: '8px 10px',
                background: `linear-gradient(135deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.22) 100%)`,
                border: `1.5px solid ${accent}40`,
                boxShadow: visible ? `0 0 8px ${accent}28` : '0 0 4px rgba(0,0,0,0.4)',
                opacity: visible ? 1 : 0,
                cursor: interactive ? 'pointer' : 'default',
                userSelect: 'none',
                touchAction: 'manipulation',
              }}
              onPointerDown={interactive ? () => startPress(d.detail) : undefined}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onPointerCancel={clearPress}
              onPointerMove={clearPress}
              onContextMenu={interactive ? (e) => { e.preventDefault(); setDetailTarget(d.detail); sfx.cardLift(); } : undefined}
            >
              <div style={{ flexShrink: 0 }}>{d.visual}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="font-extrabold truncate" style={{ color: accent, fontSize: '0.86rem' }}>
                  {d.name}
                </div>
                <div className="sb-display text-[9px] tracking-[0.15em] opacity-70" style={{ color: '#3d2810' }}>
                  {d.subtitle.toUpperCase()}
                </div>
              </div>
              <div
                className="sb-display text-[8px] tracking-[0.15em] px-2 py-0.5 rounded"
                style={{
                  background: accent + '22',
                  border: `1px solid ${accent}60`,
                  color: accent,
                }}
              >
                {d.rarity.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>
      {/* Footer hint so the gesture is discoverable. */}
      <div className="sb-mono text-[9px] opacity-55 mt-2 text-center" style={{ color: '#3d2810' }}>
        Hold a reward to inspect
      </div>

      {detailTarget && (
        <CardDetailModal
          target={detailTarget}
          onClose={() => setDetailTarget(null)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="sb-parchment p-2.5">
      <div className="sb-display text-[9px] tracking-[0.18em] opacity-65" style={{ color: 'var(--sb-gold-dark)' }}>
        {icon} {label.toUpperCase()}
      </div>
      <div className="sb-mono text-xl font-bold mt-0.5" style={{ color: '#2c1810', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  );
}

function ComboCount({ icon, label, value, accent }: { icon: string; label: string; value: number; accent: string }) {
  const fired = value > 0;
  return (
    <div className="text-center">
      <div className="text-xl mb-0.5" style={{ filter: fired ? 'drop-shadow(0 0 6px ' + accent + ')' : 'grayscale(1)', opacity: fired ? 1 : 0.4 }}>
        {icon}
      </div>
      <div className="sb-display text-[8px] tracking-[0.18em] opacity-70" style={{ color: 'var(--sb-gold-light)' }}>
        {label.toUpperCase()}
      </div>
      <div className="sb-mono text-base font-bold mt-0.5" style={{ color: fired ? accent : '#5b3a1f' }}>
        ×{value}
      </div>
    </div>
  );
}

function typeColor(t: string): string {
  switch (t) {
    case 'steel':  return '#94a3b8';
    case 'pierce': return '#fbbf24';
    case 'pyre':   return '#fca5a5';
    case 'frost':  return '#93c5fd';
    case 'arcane': return '#c4b5fd';
    default:       return '#888';
  }
}

function typeColorDk(t: string): string {
  switch (t) {
    case 'steel':  return '#475569';
    case 'pierce': return '#92400e';
    case 'pyre':   return '#7f1d1d';
    case 'frost':  return '#1e40af';
    case 'arcane': return '#5b21b6';
    default:       return '#444';
  }
}
