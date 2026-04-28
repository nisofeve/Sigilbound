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

import type { BattleRunner, CombatStageDef } from '@engine/index';

interface Props {
  outcome: 'cleared' | 'defeated';
  stage: CombatStageDef;
  runner: BattleRunner;
  onReplay: () => void;
  onNext: () => void;
  onHome: () => void;
}

export default function CombatResultScreen({ outcome, stage, runner, onReplay, onNext, onHome }: Props) {
  const player = runner.state.player;
  const cleared = outcome === 'cleared';

  const hpRatio = player.currentHp / Math.max(1, player.stats.maxHp);
  const stars = !cleared ? 0 : hpRatio > 0.5 ? 3 : hpRatio > 0.25 ? 2 : 1;

  const damageByType = player.damageDealtByType;
  const totalDmg = player.damageDealtThisStage;

  return (
    <div className="sb-bg sb-bg-stone relative h-full w-full flex flex-col safe-top safe-bottom">

      {/* Hero banner — fixed at top */}
      <div className="relative z-20 text-center pt-6 pb-4 sb-fade-up">
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
          <ComboCount icon="⚔️" label="Onslaught" value={runner.state.combosTriggeredThisStage.onslaught} accent="var(--sb-crimson-light)" />
          <ComboCount icon="✦"  label="Triadic"   value={runner.state.combosTriggeredThisStage.triadic}   accent="var(--sb-frost)" />
          <ComboCount icon="◈"  label="Relentless" value={runner.state.combosTriggeredThisStage.relentless} accent="var(--sb-arcane)" />
        </div>
      </div>

      {/* Sticky CTA dock */}
      <div
        className="relative z-20 flex gap-2 px-3 pt-2 pb-3"
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
