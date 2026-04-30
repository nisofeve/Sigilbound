// Sigilbound combat host (pure React).
//
// Owns: HP banner, sigil-slot row, hand bar, enemy portraits with HP + intent
// telegraphs, end-turn button, combo cascade flash, tactics rail. Renders
// directly to DOM — no Phaser. Reads runner.state each render via a tick
// counter that bumps on every mutating call.
//
// Layout: two responsive variants share the same engine wiring.
// - Desktop: absolute-positioned banners with fanned hand bottom-center.
// - Mobile (<720px wide or portrait): vertical flex stack — top bar →
//   enemies → slots → hand fan → bottom action bar with end-turn + tactics.
//   Cards shrink, tactics live in a togglable bottom drawer to keep the
//   playfield uncluttered.

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  buildStageRun,
  type CombatStageDef,
  type BattleRunner,
  type EquippedSet,
  type Perk,
  type EnemyState,
  type Intent,
  type ResolveEvent,
  getAction,
  getTactic,
  onslaughtMultiplier,
  triadicStrikeBonus,
  triadicStrikeMultiplier,
  relentlessMultiplier,
} from '@engine/index';
import { elementalHitLabel } from '../../engine/damage';
import { sfx } from '@game/sfx';
import { getEnemy } from '../../engine/bestiary';
import { EnemyCard as EnemyCardDisplay } from './EnemyCard';
import { ActionCard as ActionCardDisplay, TacticCard as TacticCardDisplay } from './CombatCard';

interface Props {
  stageNumber: number;
  playerLevel: number;
  equipment?: EquippedSet;
  talents?: ReadonlyArray<Perk>;
  reactions?: ReadonlyArray<string>;
  customDeck?: ReadonlyArray<string>;
  initialHp?: number;
  hardcore?: boolean;
  // Stronghold upgrades — feed into stat block + runtime buffs at battle start.
  ownedUpgradeIds?: ReadonlyArray<string>;
  // Player profile fragments for the bottom player bar. Optional so
  // dev/test callers don't have to wire them.
  playerName?: string;
  playerAvatar?: string;
  onOutcome: (outcome: 'cleared' | 'defeated', stage: CombatStageDef, runner: BattleRunner) => void;
  onExit: () => void;
}

function intentDisplay(intent: Intent): string {
  switch (intent.kind) {
    case 'attack':  return `⚔ ${intent.damage}${intent.hits && intent.hits > 1 ? `×${intent.hits}` : ''}`;
    case 'block':   return `🛡 ${intent.amount}`;
    case 'summon':  return '💀 SUMMON';
    case 'debuff':  return `🌀 ${intent.status.slice(0, 4).toUpperCase()}`;
    case 'charge':  return `⏳ ${intent.turnsLeft + 1}`;
    case 'hidden':  return '❓';
    default:        return '?';
  }
}

// Visual archetype for an attack VFX. Different from damage type — derived
// from the action card's name so "Firebolt" and "Phoenix Blast" both throw
// fireballs even if one is steel and one is pyre. Falls back to damage
// type if the name doesn't match a known pattern.
//   slash      — sweeping melee arc across the target
//   fireball   — pulsing orb with sparks; explodes on impact
//   ice_shard  — angular shard streak
//   bolt       — long thin streak (arrows, daggers, bolts)
//   arcane_orb — pulsing magic orb with halo ring
//   smash      — heavy chunky impact, slight knockback
//   beam       — straight glowing line connecting source → target
type VfxArchetype = 'slash' | 'fireball' | 'ice_shard' | 'bolt' | 'arcane_orb' | 'smash' | 'beam';

function vfxArchetypeFor(cardName: string, damageType: string): VfxArchetype {
  const n = cardName.toLowerCase();
  // Name-driven matchers — most specific first.
  if (/fire|flame|inferno|phoenix|ember|firebolt|fireball/.test(n)) return 'fireball';
  if (/frost|ice|blizzard|glacial|cold|snap|chill/.test(n)) return 'ice_shard';
  if (/slash|cleave|swing|blade dance|dance/.test(n)) return 'slash';
  if (/bolt|dagger|crossbow|sniper|volley|shot|arrow/.test(n)) return 'bolt';
  if (/bash|smash|berserk|heavy/.test(n)) return 'smash';
  if (/sigil|ruin|reality|tear|drain|surge|mana|mind/.test(n)) return 'arcane_orb';
  if (/strike|stab|riposte|edge/.test(n)) return 'slash';
  // Damage-type fallback.
  switch (damageType) {
    case 'pyre':   return 'fireball';
    case 'frost':  return 'ice_shard';
    case 'pierce': return 'bolt';
    case 'arcane': return 'arcane_orb';
    case 'steel':
    default:       return 'slash';
  }
}


// Matches the Phaser-side breakpoint in src/game/GameScene.ts.
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 720 || window.innerHeight > window.innerWidth * 1.1;
  });
  useEffect(() => {
    const onResize = () => {
      setMobile(window.innerWidth < 720 || window.innerHeight > window.innerWidth * 1.1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

export default function CombatView({
  stageNumber, playerLevel, equipment, talents, reactions, customDeck, initialHp, hardcore, ownedUpgradeIds,
  playerName = 'Sigilist', playerAvatar = '🛡️',
  onOutcome, onExit,
}: Props) {
  const isMobile = useIsMobile();

  const { runner, stage } = useMemo(() => {
    const result = buildStageRun({
      stageNumber, playerLevel, equipment, talents, reactions,
      customDeck, initialHp, hardcore, ownedUpgradeIds,
    });
    return { runner: result.runner, stage: result.stage };
  }, [stageNumber, playerLevel, equipment, talents, reactions, customDeck, initialHp, hardcore, ownedUpgradeIds]);

  const [, setTick] = useState(0);
  const repaint = useCallback(() => setTick(t => t + 1), []);

  const [comboFlash, setComboFlash] = useState<null | 'onslaught' | 'triadic' | 'relentless'>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerCombo = (k: 'onslaught' | 'triadic' | 'relentless') => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setComboFlash(k);
    // Banner lingers ~2s now to match the slower theatrical attack pacing.
    flashTimerRef.current = setTimeout(() => setComboFlash(null), 2000);
  };

  const [draggingHandIdx, setDraggingHandIdx] = useState<number | null>(null);
  const [hoverSlotIdx, setHoverSlotIdx] = useState<number | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [hoveredHandIdx, setHoveredHandIdx] = useState<number | null>(null);
  // Mobile-only: tactics drawer open/closed.
  const [tacticsOpen, setTacticsOpen] = useState(false);

  // Which enemy the player has targeted for this round. All newly bound slots
  // and existing live slots point to this enemy.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);

  // Confirmation dialogs.
  const [confirmDialog, setConfirmDialog] = useState<'end_turn_empty' | 'exit' | null>(null);

  // Info modal — long-press on an enemy card or the player bar reveals stats.
  const [infoModal, setInfoModal] = useState<
    | { kind: 'enemy'; enemy: EnemyState }
    | { kind: 'player' }
    | null
  >(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs for hand cards, slots, and enemies — used to measure DOM rects so
  // animations (flying bind, projectile attacks) can travel between exact
  // source/target positions.
  const cardRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const enemyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const playerHpRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Resolve animation queue. `animating` locks input while we step through
  // the engine's resolve log frame-by-frame. `displayedEnemyHp` overrides
  // the runner's HP for enemies during the animation so each strike's
  // hpBefore/hpAfter actually shows on screen (the engine already applied
  // every hit at endTurn time).
  const [animating, setAnimating] = useState(false);
  const [displayedEnemyHp, setDisplayedEnemyHp] = useState<Record<string, number>>({});
  const [displayedPlayerHp, setDisplayedPlayerHp] = useState<number | null>(null);
  // Floating numbers + per-target hit-flash + projectile VFX queue.
  const [floaters, setFloaters] = useState<Array<{
    id: number; x: number; y: number; text: string; color: string; crit: boolean;
  }>>([]);
  const [hitFlashes, setHitFlashes] = useState<Set<string>>(new Set());
  const [projectiles, setProjectiles] = useState<Array<{
    id: number; from: { x: number; y: number }; to: { x: number; y: number };
    damageType: string; archetype: VfxArchetype; durationMs: number; bornAt: number;
  }>>([]);
  // Slash impact overlays — short-lived sweeping arc on the target on
  // impact for slash/smash archetypes. Renders on top of the enemy card.
  const [slashes, setSlashes] = useState<Array<{
    id: number; x: number; y: number; size: number; color: string; angle: number; durationMs: number;
  }>>([]);
  const slashIdRef = useRef(0);
  // Charge-up auras — particles gathering on the slot before launch.
  const [chargeAuras, setChargeAuras] = useState<Array<{
    id: number; x: number; y: number; color: string; size: number; durationMs: number; archetype: VfxArchetype;
  }>>([]);
  const chargeAuraIdRef = useRef(0);
  // Impact rings — expanding shockwave on impact for heavy hits.
  const [impactRings, setImpactRings] = useState<Array<{
    id: number; x: number; y: number; color: string; size: number; durationMs: number;
  }>>([]);
  const impactRingIdRef = useRef(0);
  // Particle bursts — explosion effects on impact (sparks, embers, ice shards).
  const [particles, setParticles] = useState<Array<{
    id: number; x: number; y: number; color: string; archetype: VfxArchetype; count: number;
  }>>([]);
  const particleIdRef = useRef(0);
  // Screen shake — applied to the playfield container.
  const [screenShake, setScreenShake] = useState<'light' | 'heavy' | null>(null);
  const screenShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floaterIdRef = useRef(0);
  const projectileIdRef = useRef(0);

  // Flying-card animation state. While `flying` is non-null we render an
  // overlay card travelling from `from` to `to`. The original hand card with
  // realIndex === flying.handIndex is hidden so it appears to leave the hand.
  const [flying, setFlying] = useState<null | {
    def: NonNullable<ReturnType<typeof getAction>>;
    handIndex: number;
    slotIndex: number;
    cardW: number;
    cardH: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  }>(null);
  const flyingFrameRef = useRef<number | null>(null);
  // Pending commit info — set when an animation starts; cleared when commit
  // fires. Tracks whether a queued bind is still expected so unmounts don't
  // leave dangling state.
  const pendingBindRef = useRef<{ handIndex: number; slotIndex: number } | null>(null);

  useEffect(() => {
    return () => {
      if (flyingFrameRef.current !== null) cancelAnimationFrame(flyingFrameRef.current);
    };
  }, []);

  function handlePlayTactic(realHandIndex: number): void {
    if (runner.playTactic(realHandIndex) === 'played') {
      // Close the drawer after a play so the playfield re-asserts focus.
      if (isMobile) setTacticsOpen(false);
      repaint();
    }
  }

  // === Damage-type colors for VFX projectiles ===
  const damageTypeVfxColor = (t: string): string => {
    switch (t) {
      case 'pyre':   return '#ff7a1a';
      case 'frost':  return '#7ec4ff';
      case 'arcane': return '#c97cff';
      case 'pierce': return '#ffd569';
      case 'steel':
      default:       return '#e2e2e2';
    }
  };

  // Push a floating damage number at world coords. Auto-cleans after 900ms.
  function spawnFloater(x: number, y: number, text: string, color: string, crit: boolean) {
    const id = ++floaterIdRef.current;
    setFloaters(list => [...list, { id, x, y, text, color, crit }]);
    setTimeout(() => setFloaters(list => list.filter(f => f.id !== id)), 950);
  }

  // Briefly flash an enemy/player target with a hit ring.
  function flashTarget(id: string, durationMs = 380) {
    setHitFlashes(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      setHitFlashes(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, durationMs);
  }

  // Spawn a projectile flying from `from` → `to`. Resolves once landed.
  // Archetype drives the visual: fireball / ice_shard / slash / bolt /
  // arcane_orb / smash / beam — see vfxArchetypeFor.
  function spawnProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    damageType: string,
    archetype: VfxArchetype = 'slash',
    durationMs = 320,
  ): Promise<void> {
    return new Promise(resolve => {
      const id = ++projectileIdRef.current;
      setProjectiles(list => [...list, { id, from, to, damageType, archetype, durationMs, bornAt: performance.now() }]);
      setTimeout(() => {
        setProjectiles(list => list.filter(p => p.id !== id));
        resolve();
      }, durationMs);
    });
  }

  // Spawn a slash sweep on the target — short-lived arc that shows where
  // the strike lands. `durationMs` controls how long the arc lingers; bigger
  // attacks use longer arcs for theatrical weight.
  function spawnSlash(x: number, y: number, size: number, color: string, angle = 0, durationMs = 600): void {
    const id = ++slashIdRef.current;
    setSlashes(list => [...list, { id, x, y, size, color, angle, durationMs }]);
    setTimeout(() => setSlashes(list => list.filter(s => s.id !== id)), durationMs);
  }

  // Charge-up aura — particles gather on the slot before the projectile
  // launches. The aura visualizes the "wind-up" of a strike.
  function spawnChargeAura(x: number, y: number, color: string, size: number, durationMs: number, archetype: VfxArchetype): Promise<void> {
    return new Promise(resolve => {
      const id = ++chargeAuraIdRef.current;
      setChargeAuras(list => [...list, { id, x, y, color, size, durationMs, archetype }]);
      setTimeout(() => {
        setChargeAuras(list => list.filter(a => a.id !== id));
        resolve();
      }, durationMs);
    });
  }

  // Impact ring — expanding shockwave at the impact point. Used for heavy
  // hits to add weight to the moment of contact.
  function spawnImpactRing(x: number, y: number, color: string, size: number, durationMs = 700): void {
    const id = ++impactRingIdRef.current;
    setImpactRings(list => [...list, { id, x, y, color, size, durationMs }]);
    setTimeout(() => setImpactRings(list => list.filter(r => r.id !== id)), durationMs);
  }

  // Particle burst — explosion of small particles at the impact point.
  // Sparks (steel/pyre), shards (frost), motes (arcane).
  function spawnParticles(x: number, y: number, color: string, archetype: VfxArchetype, count = 8): void {
    const id = ++particleIdRef.current;
    setParticles(list => [...list, { id, x, y, color, archetype, count }]);
    setTimeout(() => setParticles(list => list.filter(p => p.id !== id)), 1100);
  }

  // Screen shake — applied to the root playfield container. Light = small
  // jitter for impacts. Heavy = bigger shake for crits/kills/bosses.
  function shakeScreen(intensity: 'light' | 'heavy' = 'light'): void {
    if (screenShakeTimerRef.current) clearTimeout(screenShakeTimerRef.current);
    setScreenShake(intensity);
    screenShakeTimerRef.current = setTimeout(() => setScreenShake(null), intensity === 'heavy' ? 480 : 280);
  }

  // Sleep helper — returns a promise resolved after `ms`.
  const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  // Walk the resolve log and play VFX/SFX for each event in sequence.
  // The engine has already applied damage; this only animates display state.
  // Combo-marked slots are grouped into "volleys" — they wind up together,
  // then their projectiles launch in a tight burst (~70ms apart) so the
  // combo reads as a coordinated strike rather than a queue of individual
  // hits. Solo (non-combo) slots play one at a time as before.
  async function playResolveLog(
    log: ReadonlyArray<ResolveEvent>,
    comboSlotMap: ReadonlyMap<number, string>, // slotIdx → combo color hex
  ): Promise<void> {
    if (log.length === 0) return;

    setAnimating(true);
    setSelectedEnemyId(null);
    // Snapshot the pre-resolve HP for every enemy and the player. We override
    // the displayed HP so the bars don't snap to final state immediately.
    const initialEnemyHp: Record<string, number> = {};
    for (const ev of log) {
      if (ev.kind === 'action_resolve' && ev.targetEnemyId && initialEnemyHp[ev.targetEnemyId] === undefined) {
        initialEnemyHp[ev.targetEnemyId] = ev.enemyHpBefore;
      }
    }
    setDisplayedEnemyHp(initialEnemyHp);

    let initialPlayerHp: number | null = null;
    for (const ev of log) {
      if (ev.kind === 'enemy_attack') {
        initialPlayerHp = ev.playerHpBefore;
        break;
      }
    }
    if (initialPlayerHp !== null) setDisplayedPlayerHp(initialPlayerHp);

    // Walk the log with grouped-volley awareness. We look ahead in
    // contiguous runs of action_resolve events and bundle the ones whose
    // slot is part of a combo into a single volley.
    let i = 0;
    while (i < log.length) {
      const ev = log[i];
      if (ev.kind === 'action_resolve') {
        // Collect a contiguous run of action_resolves that all share combo
        // membership (i.e. are all combo-tagged). Solo resolves play one
        // at a time. We require at least 2 combo-tagged events back-to-back
        // to actually trigger the volley wind-up.
        const run: Extract<ResolveEvent, { kind: 'action_resolve' }>[] = [];
        let j = i;
        while (j < log.length && log[j].kind === 'action_resolve') {
          const aev = log[j] as Extract<ResolveEvent, { kind: 'action_resolve' }>;
          const isCombo = comboSlotMap.has(aev.slotIndex);
          if (isCombo) {
            run.push(aev);
            j++;
          } else {
            break; // solo resolves break the volley group
          }
        }
        if (run.length >= 2) {
          await playComboVolley(run, comboSlotMap);
          i = j;
        } else {
          await playActionResolve(ev as Extract<ResolveEvent, { kind: 'action_resolve' }>);
          i++;
        }
      } else if (ev.kind === 'combo') {
        triggerCombo(ev.combo);
        if (ev.combo === 'onslaught') sfx.comboOnslaught();
        else if (ev.combo === 'triadic') sfx.comboTriadic();
        else if (ev.combo === 'relentless') sfx.comboRelentless();
        // Hold on the banner so the player reads + savors the combo name
        // before the next sequence starts.
        await wait(1100);
        i++;
      } else if (ev.kind === 'enemy_attack') {
        await playEnemyAttack(ev);
        i++;
      } else if (ev.kind === 'enemy_block') {
        sfx.blockGain();
        flashTarget(ev.enemyId, 280);
        await wait(180);
        i++;
      } else {
        // enemy_debuff: silent for now — already covered by status icons later.
        i++;
      }
    }

    // Wait 1 second before starting the new round — gives the player time
    // to absorb the results before new cards are drawn and the next round begins.
    await wait(1000);

    setAnimating(false);
    setDisplayedEnemyHp({});
    setDisplayedPlayerHp(null);
    setWindingUpSlots(new Set());
  }

  // Play a combo volley: long theatrical wind-up on all involved slots,
  // then launch their projectiles in a staggered burst. Each strike still
  // runs its full 3-5s charge → flight → impact, but they're overlapped
  // so the volley doesn't feel like a queue. Total volley time is
  // dominated by the longest strike + the stagger interval.
  async function playComboVolley(
    events: ReadonlyArray<Extract<ResolveEvent, { kind: 'action_resolve' }>>,
    _comboSlotMap: ReadonlyMap<number, string>,
  ): Promise<void> {
    // 1. Theatrical wind-up — bright pulse on all participating slots,
    // building combo SFX, brief screen tint to signal "BIG MOMENT".
    const slotIndices = events.map(e => e.slotIndex).filter(i => i >= 0);
    setWindingUpSlots(new Set(slotIndices));
    sfx.cardLift();
    sfx.cardLift();  // double-tap for emphasis
    await wait(800);  // longer wind-up so combos feel earned

    // 2. Launch the volley — strikes fire in a 220ms stagger so each one
    // reads distinctly but they overlap into a sustained barrage. Each
    // strike runs its full theatrical pacing internally.
    setWindingUpSlots(new Set());
    const launchPromises: Promise<void>[] = [];
    events.forEach((ev, idx) => {
      const launchDelay = idx * 220;
      launchPromises.push((async () => {
        if (launchDelay > 0) await wait(launchDelay);
        await playSingleStrike(ev, /* skipSlotPulse */ false);
      })());
    });
    await Promise.all(launchPromises);

    await wait(280);
  }

  async function playActionResolve(ev: Extract<ResolveEvent, { kind: 'action_resolve' }>): Promise<void> {
    await playSingleStrike(ev, /* skipSlotPulse */ false);
    await wait(ev.enemyKilled ? 480 : 320);
  }

  // Per-archetype timing profile. Each strike is divided into 3 phases:
  //   chargeMs  — slot pulses + aura gathers + SFX cue (anticipation)
  //   flightMs  — projectile travels (or slash blink delay)
  //   impactMs  — flash, particles, ring, hold for damage to land
  // Total per strike: chargeMs + flightMs + impactMs. Aim for 3-5s per
  // strike. Heavier archetypes take longer for theatrical weight.
  function timingFor(archetype: VfxArchetype): { chargeMs: number; flightMs: number; impactMs: number } {
    switch (archetype) {
      case 'fireball':   return { chargeMs: 1100, flightMs: 1500, impactMs: 1100 }; // 3.7s — slow ignite, lobbed arc, big boom
      case 'ice_shard':  return { chargeMs:  900, flightMs:  900, impactMs:  900 }; // 2.7s — quick crystalline strike
      case 'arcane_orb': return { chargeMs: 1300, flightMs: 1400, impactMs: 1300 }; // 4.0s — most theatrical, ritual feel
      case 'bolt':       return { chargeMs:  650, flightMs:  700, impactMs:  700 }; // 2.05s — snappy ranged
      case 'slash':      return { chargeMs:  900, flightMs:  450, impactMs: 1000 }; // 2.35s — swift but heavy impact
      case 'smash':      return { chargeMs: 1400, flightMs:  500, impactMs: 1400 }; // 3.3s — heavy windup, crushing impact
      case 'beam':       return { chargeMs: 1500, flightMs:  600, impactMs: 1100 }; // 3.2s — long charge, instant beam
      default:           return { chargeMs:  800, flightMs:  600, impactMs:  800 };
    }
  }

  // The "fire one strike" primitive used by both solo resolves and combo
  // volleys. Picks a VFX archetype from the card name, fires SFX matching
  // the damage type, runs charge → flight → impact phases.
  async function playSingleStrike(
    ev: Extract<ResolveEvent, { kind: 'action_resolve' }>,
    skipSlotPulse: boolean,
  ): Promise<void> {
    const slotEl = ev.slotIndex >= 0 ? slotRefs.current.get(ev.slotIndex) : undefined;
    const enemyEl = ev.targetEnemyId ? enemyRefs.current.get(ev.targetEnemyId) : undefined;
    const cardDef = getAction(ev.cardId);
    const cardName = cardDef?.name ?? '';
    const archetype = vfxArchetypeFor(cardName, ev.damageType);
    const color = damageTypeVfxColor(ev.damageType);
    const timing = timingFor(archetype);

    if (!slotEl || !enemyEl) {
      // Fallback if rects missing — skip animation, just commit display.
      if (ev.targetEnemyId) {
        setDisplayedEnemyHp(prev => ({ ...prev, [ev.targetEnemyId!]: ev.enemyHpAfter }));
      }
      await wait(300);
      return;
    }

    const sRect = slotEl.getBoundingClientRect();
    const eRect = enemyEl.getBoundingClientRect();
    const from = { x: sRect.left + sRect.width / 2, y: sRect.top + sRect.height / 2 };
    const to = { x: eRect.left + eRect.width / 2, y: eRect.top + eRect.height / 2 };

    // ============================================================
    // PHASE 1: CHARGE-UP — slot pulses, aura gathers, SFX cue
    // ============================================================
    if (!skipSlotPulse) {
      // Slot pulse during charge — scale + outer box-shadow only. NO
      // `filter: brightness()` (washes the emoji white) and NO `inset`
      // box-shadow (paints color over the icon area inside the hex
      // clip-path). The colored OUTER glow sits beyond the slot edge,
      // so the icon stays fully legible.
      // fill: 'none' (default) so the animation cleanly returns to baseline
      // when it ends — fill: 'forwards' would leave the slot scaled up
      // forever between turns.
      slotEl.animate(
        [
          { transform: 'scale(1)',    boxShadow: `0 0 0 transparent` },
          { transform: 'scale(1.18)', boxShadow: `0 0 32px ${color}, 0 0 56px ${color}88`, offset: 0.5 },
          { transform: 'scale(1.08)', boxShadow: `0 0 18px ${color}, 0 0 32px ${color}66` },
        ],
        { duration: timing.chargeMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
    }
    // Charge-up SFX: soft breath at the start of the wind-up.
    sfx.cardLift();
    // Aura gathering on the slot.
    void spawnChargeAura(from.x, from.y, color, sRect.width * 1.2, timing.chargeMs, archetype);
    await wait(timing.chargeMs);

    // ============================================================
    // PHASE 2: PROJECTILE FLIGHT
    // ============================================================
    // Damage-type SFX fires at launch (apex of the wind-up).
    switch (ev.damageType) {
      case 'pyre':   sfx.pyreHit();   break;
      case 'frost':  sfx.frostHit();  break;
      case 'arcane': sfx.arcaneHit(); break;
      case 'pierce': sfx.pierceHit(); break;
      case 'steel':
      default:       sfx.steelHit();  break;
    }
    // Reset the slot transform + glow smoothly. fill: 'none' so the
    // animation doesn't pin the slot at scale(1) and break later React-
    // driven hover/scale styles. Outer glow only — no inset shadow.
    slotEl.animate(
      [
        { transform: 'scale(1.08)', boxShadow: `0 0 18px ${color}, 0 0 32px ${color}66` },
        { transform: 'scale(1)',    boxShadow: `0 0 0 transparent` },
      ],
      { duration: 200, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' },
    );
    if (archetype !== 'slash' && archetype !== 'smash') {
      await spawnProjectile(from, to, ev.damageType, archetype, timing.flightMs);
    } else {
      // Slash/smash — short delay then blink the slash arc on the target.
      await wait(timing.flightMs);
    }

    // ============================================================
    // PHASE 3: IMPACT — flash, slash arc, particles, ring, HP drain
    // ============================================================
    // Mark this slot's ghost as resolved — its icon will fade out so the
    // player sees the card has been "consumed" by the launch.
    if (ev.slotIndex >= 0) {
      setResolvedGhostSlots(prev => {
        const next = new Set(prev);
        next.add(ev.slotIndex);
        return next;
      });
    }

    if (ev.targetEnemyId) {
      flashTarget(ev.targetEnemyId, timing.impactMs * 0.7);
      setDisplayedEnemyHp(prev => ({ ...prev, [ev.targetEnemyId!]: ev.enemyHpAfter }));
      const r = enemyEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      // Enemy card shake — strong, immediate jolt the moment the projectile
      // arrives. Heavier archetypes shake harder. This is a Web Animations
      // tween (not a CSS class) so it can run alongside other state-driven
      // styles on the enemy card without a class swap.
      const shakeIntensity = (archetype === 'fireball' || archetype === 'smash' || ev.wasCrit) ? 14
                           : (archetype === 'arcane_orb' || archetype === 'beam') ? 10
                           : 8;
      enemyEl.animate(
        [
          { transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(${-shakeIntensity}px, ${shakeIntensity * 0.4}px) rotate(-2deg)`, offset: 0.1 },
          { transform: `translate(${shakeIntensity}px, ${-shakeIntensity * 0.3}px) rotate(2deg)`,  offset: 0.25 },
          { transform: `translate(${-shakeIntensity * 0.7}px, ${shakeIntensity * 0.5}px) rotate(-1.5deg)`, offset: 0.4 },
          { transform: `translate(${shakeIntensity * 0.6}px, ${-shakeIntensity * 0.2}px) rotate(1deg)`, offset: 0.55 },
          { transform: `translate(${-shakeIntensity * 0.4}px, ${shakeIntensity * 0.3}px) rotate(-0.5deg)`, offset: 0.7 },
          { transform: `translate(${shakeIntensity * 0.2}px, 0) rotate(0deg)`, offset: 0.85 },
          { transform: 'translate(0, 0) rotate(0deg)' },
        ],
        { duration: Math.min(600, timing.impactMs * 0.7), easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
      );

      // Per-archetype impact effects.
      switch (archetype) {
        case 'fireball':
          // Big explosion: ring + lots of ember particles + screen shake.
          spawnImpactRing(cx, cy, color, r.width * 1.6, 800);
          spawnParticles(cx, cy, color, 'fireball', 14);
          shakeScreen(ev.wasCrit || ev.enemyKilled ? 'heavy' : 'light');
          break;
        case 'ice_shard':
          // Cold shatter: shard particles + thin ring.
          spawnImpactRing(cx, cy, color, r.width * 1.2, 600);
          spawnParticles(cx, cy, color, 'ice_shard', 10);
          break;
        case 'arcane_orb':
          // Mystical implosion: pulsing ring + arcane motes.
          spawnImpactRing(cx, cy, color, r.width * 1.4, 900);
          spawnImpactRing(cx, cy, '#ffffff', r.width * 0.9, 600);
          spawnParticles(cx, cy, color, 'arcane_orb', 12);
          break;
        case 'bolt':
          // Quick puncture: tiny ring + sparks.
          spawnImpactRing(cx, cy, color, r.width * 0.8, 450);
          spawnParticles(cx, cy, color, 'bolt', 6);
          break;
        case 'slash':
          spawnSlash(cx, cy, r.width * 1.1, color, -25 + Math.random() * 50, timing.impactMs * 0.7);
          spawnParticles(cx, cy, color, 'slash', 8);
          if (ev.wasCrit) shakeScreen('light');
          break;
        case 'smash':
          spawnSlash(cx, cy, r.width * 1.3, color, 0, timing.impactMs * 0.7);
          spawnImpactRing(cx, cy, color, r.width * 1.5, 700);
          spawnParticles(cx, cy, color, 'smash', 12);
          shakeScreen('heavy');  // smash is always weighty
          break;
        case 'beam':
          spawnImpactRing(cx, cy, color, r.width * 1.3, 700);
          spawnParticles(cx, cy, color, 'beam', 10);
          break;
      }

      spawnFloater(
        cx, r.top + r.height * 0.3,
        ev.damageDealt > 0 ? `-${ev.damageDealt}` : 'BLOCK',
        ev.damageDealt > 0 ? color : '#fde68a',
        ev.wasCrit,
      );

      // Elemental effectiveness badge — shows slightly above the damage number.
      const elemLabel = elementalHitLabel(ev.resistMult);
      if (elemLabel) {
        spawnFloater(
          cx, r.top + r.height * 0.05,
          elemLabel === 'weakness' ? '⚡ WEAKNESS!' : '🛡 RESISTED',
          elemLabel === 'weakness' ? '#fde68a' : '#94a3b8',
          false,
        );
      }

      if (ev.wasCrit) {
        sfx.critHit();
        shakeScreen('heavy');
      }
      if (ev.enemyKilled) {
        await wait(timing.impactMs * 0.4);
        sfx.enemyKill();
        shakeScreen('heavy');
        await wait(timing.impactMs * 0.6);
      } else {
        await wait(timing.impactMs);
      }
    } else {
      await wait(timing.impactMs);
    }
  }

  // Enemy attack — mirrors playSingleStrike's three-phase theatrical
  // pacing (charge → flight → impact) but with the source/target reversed.
  // Each phase has its own VFX + SFX based on the enemy's damage type:
  //   - Wind-up: enemy lurches + colored charge aura gathers on it
  //   - Flight: damage-type projectile flies to the player bar
  //   - Impact: ring + particles burst on player, bar shakes hard, screen
  //     shakes, HP bar drains, floater number rises
  async function playEnemyAttack(ev: Extract<ResolveEvent, { kind: 'enemy_attack' }>): Promise<void> {
    const enemyEl = enemyRefs.current.get(ev.enemyId);
    const playerEl = playerHpRef.current;
    const color = damageTypeVfxColor(ev.damageType);
    // Enemy attacks use damage-type fallback archetype (no name to read).
    const enemyArchetype: VfxArchetype =
      ev.damageType === 'pyre'   ? 'fireball' :
      ev.damageType === 'frost'  ? 'ice_shard' :
      ev.damageType === 'arcane' ? 'arcane_orb' :
      ev.damageType === 'pierce' ? 'bolt' :
                                   'slash';
    const timing = timingFor(enemyArchetype);

    if (!enemyEl || !playerEl) {
      setDisplayedPlayerHp(ev.playerHpAfter);
      await wait(300);
      return;
    }

    const eRect = enemyEl.getBoundingClientRect();
    const pRect = playerEl.getBoundingClientRect();
    const from = { x: eRect.left + eRect.width / 2, y: eRect.top + eRect.height / 2 };
    const to = { x: pRect.left + pRect.width / 2, y: pRect.top + pRect.height / 2 };

    // ============================================================
    // PHASE 1 — WIND-UP: enemy gathers menace + aura builds + SFX cue
    // ============================================================
    // No filter:brightness on the enemy card — same reason as for slots:
    // it washes out the emoji + name. Use scale + box-shadow instead so
    // the glow sits OUTSIDE the card body and the icon stays readable.
    enemyEl.animate(
      [
        { transform: 'scale(1)',                        boxShadow: `0 0 0 transparent` },
        { transform: 'scale(1.20)',                     boxShadow: `0 0 28px ${color}, inset 0 0 14px ${color}99`, offset: 0.55 },
        { transform: 'translateY(14px) scale(0.92)',    boxShadow: `0 0 18px ${color}`, offset: 0.85 },
        { transform: 'scale(1)',                        boxShadow: `0 0 0 transparent` },
      ],
      { duration: timing.chargeMs, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    void spawnChargeAura(from.x, from.y, color, eRect.width * 0.85, timing.chargeMs, enemyArchetype);
    sfx.cardLift();
    await wait(timing.chargeMs);

    // ============================================================
    // PHASE 2 — PROJECTILE FLIGHT
    // ============================================================
    switch (ev.damageType) {
      case 'pyre':   sfx.pyreHit();   break;
      case 'frost':  sfx.frostHit();  break;
      case 'arcane': sfx.arcaneHit(); break;
      case 'pierce': sfx.pierceHit(); break;
      case 'steel':
      default:       sfx.enemyAttack(); break;
    }
    if (enemyArchetype !== 'slash') {
      await spawnProjectile(from, to, ev.damageType, enemyArchetype, timing.flightMs);
    } else {
      await wait(timing.flightMs);
    }

    // ============================================================
    // PHASE 3 — IMPACT on the player bar — bar shakes hard, big VFX,
    // screen shakes, HP bar drains, floater number rises.
    // ============================================================
    setDisplayedPlayerHp(ev.playerHpAfter);
    const r = playerEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    // Per-archetype impact VFX — mirrors the player-side strike palette
    // but anchored on the player bar.
    switch (enemyArchetype) {
      case 'fireball':
        // Big explosion: ring + ember particles + heavy screen shake.
        spawnImpactRing(cx, cy, color, Math.min(r.width * 0.9, 280), 800);
        spawnImpactRing(cx, cy, '#ffa850', Math.min(r.width * 0.55, 180), 600);
        spawnParticles(cx, cy, color, 'fireball', 16);
        break;
      case 'ice_shard':
        // Cold shatter: shard particles + thin ring.
        spawnImpactRing(cx, cy, color, Math.min(r.width * 0.7, 220), 600);
        spawnParticles(cx, cy, color, 'ice_shard', 12);
        break;
      case 'arcane_orb':
        // Mystical implosion: pulsing rings + arcane motes.
        spawnImpactRing(cx, cy, color, Math.min(r.width * 0.85, 260), 900);
        spawnImpactRing(cx, cy, '#ffffff', Math.min(r.width * 0.5, 160), 600);
        spawnParticles(cx, cy, color, 'arcane_orb', 14);
        break;
      case 'bolt':
        // Quick puncture: tiny ring + sparks.
        spawnImpactRing(cx, cy, color, Math.min(r.width * 0.45, 140), 450);
        spawnParticles(cx, cy, color, 'bolt', 8);
        break;
      case 'slash':
      default:
        // Sweeping slash arc across the player bar + sparks.
        spawnSlash(cx, cy, Math.min(r.width * 0.85, 260), color, -25 + Math.random() * 50, timing.impactMs * 0.7);
        spawnImpactRing(cx, cy, color, Math.min(r.width * 0.5, 160), 500);
        spawnParticles(cx, cy, color, 'slash', 10);
        break;
    }

    // Strong shake on the player bar itself — a hard jolt at the moment of
    // impact. Heavier hits shake harder. WAAPI tween so it composes with
    // the existing CSS .sb-shake class without fighting it.
    const shakeIntensity = (enemyArchetype === 'fireball' || enemyArchetype === 'arcane_orb' || ev.damageDealt > 15)
      ? 16
      : (ev.damageDealt > 8 ? 12 : 8);
    playerEl.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${-shakeIntensity}px, ${shakeIntensity * 0.4}px) rotate(-1.5deg)`, offset: 0.1 },
        { transform: `translate(${shakeIntensity}px, ${-shakeIntensity * 0.3}px) rotate(1.5deg)`,  offset: 0.25 },
        { transform: `translate(${-shakeIntensity * 0.7}px, ${shakeIntensity * 0.5}px) rotate(-1deg)`, offset: 0.4 },
        { transform: `translate(${shakeIntensity * 0.6}px, ${-shakeIntensity * 0.2}px) rotate(0.8deg)`, offset: 0.55 },
        { transform: `translate(${-shakeIntensity * 0.4}px, ${shakeIntensity * 0.3}px) rotate(-0.4deg)`, offset: 0.7 },
        { transform: `translate(${shakeIntensity * 0.2}px, 0) rotate(0deg)`, offset: 0.85 },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ],
      { duration: Math.min(700, timing.impactMs * 0.85), easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' },
    );

    // Damage floater + flash + screen shake.
    spawnFloater(
      cx, r.top - 8,
      ev.damageDealt > 0 ? `-${ev.damageDealt}` : 'BLOCK',
      ev.damageDealt > 0 ? color : '#fde68a',
      false,
    );
    flashTarget('__player__', timing.impactMs * 0.85);
    if (ev.damageDealt > 0) {
      shakeScreen(ev.damageDealt > 15 ? 'heavy' : 'light');
    }
    await wait(timing.impactMs);
  }

  function handleEndTurn(force = false): void {
    if (animating) return;
    // If no cards are bound to any slot, confirm before ending the turn.
    if (!force) {
      const hasAnyBound = runner.state.slots.some(s => s.bound);
      if (!hasAnyBound) {
        setConfirmDialog('end_turn_empty');
        return;
      }
    }
    // Capture the combo preview BEFORE endTurn() because endTurn empties
    // the slots — afterwards previewCombosForEndTurn would return nothing.
    // We pass the map down so the sequencer can group volleys correctly.
    const preview = runner.previewCombosForEndTurn();
    const comboSlotMap = new Map<number, string>();
    for (const idx of preview.onslaught) comboSlotMap.set(idx, '#ff5757');
    for (const idx of preview.relentless) {
      if (!comboSlotMap.has(idx)) comboSlotMap.set(idx, '#c084fc');
    }
    for (const idx of preview.triadic) {
      if (!comboSlotMap.has(idx)) comboSlotMap.set(idx, '#7ec4ff');
    }

    // Snapshot the bound cards per slot — so SigilSlot can keep showing
    // the correct emoji during the wind-up/flight/impact animations even
    // though endTurn() will clear the bindings immediately.
    const ghosts = new Map<number, string>();
    for (let i = 0; i < runner.state.slots.length; i++) {
      const b = runner.state.slots[i]?.bound;
      // Only snapshot slots that will actually resolve this turn (charge<=1
      // ticks to 0). Higher-charge slots stay bound through endTurn so they
      // already have their own ghost (the live binding).
      if (b && b.charge <= 1) ghosts.set(i, b.cardId);
    }
    setGhostBindings(ghosts);
    setResolvedGhostSlots(new Set());

    const outcome = runner.endTurn();
    const log = runner.getLastResolveLog();
    repaint();
    void playResolveLog(log, comboSlotMap).then(() => {
      // Sequence done — release the ghosts so the slot row reverts to live
      // engine state (empty slots show ⬡ again).
      setGhostBindings(new Map());
      setResolvedGhostSlots(new Set());
      if (outcome !== 'in_progress') onOutcome(outcome, stage, runner);
    });
  }

  // Easing — cubic out matches the Plotbound feel (Phaser 'Cubic.out').
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  function commitBind(realHandIndex: number, slotIndex: number): void {
    if (runner.bindHandToSlot(realHandIndex, slotIndex)) {
      if (selectedEnemyId) runner.retarget(slotIndex, selectedEnemyId);
      setSelectedHandIdx(null);
      repaint();
    }
  }

  function handleBindToSlot(realHandIndex: number, slotIndex: number): void {
    // Look up DOM rects for the source card and target slot. If either is
    // missing (animation refs not yet attached, off-screen, etc.) commit
    // immediately without animation.
    const cardEl = cardRefs.current.get(realHandIndex);
    const slotEl = slotRefs.current.get(slotIndex);
    const def = getAction(runner.state.hand[realHandIndex] ?? '');
    if (!cardEl || !slotEl || !def) {
      commitBind(realHandIndex, slotIndex);
      return;
    }

    // Validate the bind would succeed before kicking off the animation —
    // otherwise we'd fly the card just to bounce it back.
    const slot = runner.state.slots[slotIndex];
    if (!slot || slot.bound) {
      commitBind(realHandIndex, slotIndex); // engine will reject and no-op
      return;
    }

    // Prefer the page coordinates of the un-transformed card body. The card
    // has fan rotation/lift transforms; we want the rect of where it visually
    // sits right now, which is exactly what getBoundingClientRect returns.
    const cardRect = cardEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    const cardW = cardRect.width;
    const cardH = cardRect.height;

    // Align the destination so the flying card lands centered on the slot.
    const from = { x: cardRect.left, y: cardRect.top };
    const to = {
      x: slotRect.left + slotRect.width / 2 - cardW / 2,
      y: slotRect.top + slotRect.height / 2 - cardH / 2,
    };

    setFlying({ def, handIndex: realHandIndex, slotIndex, cardW, cardH, from, to });
    pendingBindRef.current = { handIndex: realHandIndex, slotIndex };

    // Drive the position via rAF rather than CSS so we can curve the path
    // (parabolic arc) and modulate scale/rotation independently. The tween
    // commits the bind on the last frame and clears the flying state.
    const duration = 360;
    const startTime = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = easeOutCubic(t);
      // Position via rAF: directly mutate the overlay's transform.
      const dx = from.x + (to.x - from.x) * eased;
      const dy = from.y + (to.y - from.y) * eased;
      // Parabolic arc — peak rises the higher of the two endpoints by ~80px,
      // scaled by horizontal travel so very short flights stay subtle.
      const travel = Math.hypot(to.x - from.x, to.y - from.y);
      const arcAmt = Math.min(120, travel * 0.45);
      const arcOffset = Math.sin(eased * Math.PI) * arcAmt;
      // Rotation curve — slight tilt toward direction of travel mid-flight.
      const dirSign = Math.sign(to.x - from.x) || 1;
      const rot = Math.sin(eased * Math.PI) * 12 * dirSign;
      // Scale: a slight grow at apex, then shrink to slot size for the snap.
      const apexScale = 1.08;
      const slotScale = Math.max(0.6, slotRect.width / cardW);
      // Two-stage scale — grow until ~50% then shrink down to slot size.
      const scale = eased < 0.5
        ? 1 + (apexScale - 1) * (eased / 0.5)
        : apexScale + (slotScale - apexScale) * ((eased - 0.5) / 0.5);

      const el = overlayRef.current;
      if (el) {
        el.style.transform =
          `translate3d(${dx}px, ${dy - arcOffset}px, 0) ` +
          `rotate(${rot}deg) scale(${scale})`;
        el.style.opacity = String(1 - Math.max(0, eased - 0.85) * 4);
      }

      if (t < 1) {
        flyingFrameRef.current = requestAnimationFrame(tick);
      } else {
        flyingFrameRef.current = null;
        const pending = pendingBindRef.current;
        pendingBindRef.current = null;
        setFlying(null);
        if (pending) commitBind(pending.handIndex, pending.slotIndex);
      }
    };

    // If a previous flight is still in progress, commit it immediately so
    // its bind doesn't get lost when we replace the rAF loop.
    if (flyingFrameRef.current !== null) {
      cancelAnimationFrame(flyingFrameRef.current);
      const stale = pendingBindRef.current;
      if (stale) {
        pendingBindRef.current = null;
        commitBind(stale.handIndex, stale.slotIndex);
      }
    }
    flyingFrameRef.current = requestAnimationFrame(tick);
  }

  function handleSlotClick(slotIndex: number): void {
    // Priority 1: a card is selected → bind it to this slot.
    if (selectedHandIdx !== null) {
      handleBindToSlot(selectedHandIdx, slotIndex);
      return;
    }
    // Priority 2: tapping an already-bound slot. If the bind happened this
    // turn, return the card to hand. Older binds are locked and ignore
    // the tap (the lock badge in the slot tells the player why).
    const slot = runner.state.slots[slotIndex];
    if (slot && slot.bound && runner.canReturnSlotToHand(slotIndex)) {
      runner.returnSlotToHand(slotIndex);
      repaint();
    }
  }

  function handleCardClick(realHandIndex: number): void {
    setSelectedHandIdx(prev => {
      if (prev !== realHandIndex) {
        // First click — just select the card.
        return realHandIndex;
      }
      // Second click on the same card — auto-bind to the leftmost empty slot.
      // (Slots are stored top-row-first L→R, so index 0 is the topmost-left.)
      const emptySlotIdx = runner.state.slots.findIndex(s => !s.bound);
      if (emptySlotIdx >= 0) {
        // Defer to next tick so the state setter completes cleanly before
        // handleBindToSlot kicks off the flying animation.
        setTimeout(() => handleBindToSlot(realHandIndex, emptySlotIdx), 0);
      }
      // Either way, deselect — the bind animation will commit the engine state.
      return null;
    });
  }

  function handleEnemySelect(enemyId: string): void {
    if (animating) return;
    setSelectedEnemyId(prev => {
      const next = prev === enemyId ? null : enemyId;
      // Retarget all live bound slots to the new selection immediately.
      if (next) {
        runner.state.slots.forEach((slot, idx) => {
          if (slot.bound) runner.retarget(idx, next);
        });
        repaint();
      }
      return next;
    });
  }

  function startLongPress(cb: () => void): void {
    longPressTimerRef.current = setTimeout(cb, 550);
  }
  function cancelLongPress(): void {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  const actionsInHand = runner.state.hand
    .map((id, i) => ({ id, def: getAction(id), realIndex: i }))
    .filter((x): x is { id: string; def: NonNullable<ReturnType<typeof getAction>>; realIndex: number } => !!x.def);

  const tacticsInHand = runner.state.hand
    .map((id, i) => ({ def: getTactic(id), realIndex: i }))
    .filter((t): t is { def: NonNullable<ReturnType<typeof getTactic>>; realIndex: number } => !!t.def);

  // Combo preview — which slots will participate in which combos when
  // END TURN fires? Computed each render so the highlight updates live as
  // the player binds/unbinds cards. Skipped during animation so the
  // highlights don't flicker mid-resolve.
  const comboPreview = animating
    ? { onslaught: [], triadic: [], relentless: [] }
    : runner.previewCombosForEndTurn();
  const onslaughtSet = new Set(comboPreview.onslaught);
  const triadicSet = new Set(comboPreview.triadic);
  const relentlessSet = new Set(comboPreview.relentless);

  // Per-slot damage preview — shows approximate effective damage above each
  // slot. Uses the same multiplier functions as the battle engine so the
  // numbers match what actually resolves on END TURN.
  type SlotDmgInfo = { base: number; effective: number; willResolve: boolean; combo: 'onslaught' | 'triadic' | 'relentless' | null } | null;
  const slotDamagePreview: SlotDmgInfo[] = (() => {
    if (animating) return runner.state.slots.map(() => null);
    const slots = runner.state.slots;
    // Resolving slots: charge <= 1 (will tick to 0 on end turn).
    const resolvingIdxs = slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.bound && s.bound.charge <= 1);
    const counts = new Map<string, number>();
    for (const { s } of resolvingIdxs) counts.set(s.bound!.damageType, (counts.get(s.bound!.damageType) ?? 0) + 1);
    const distinctCount = counts.size;
    const allOneType = distinctCount === 1;
    const carriedRelentless = allOneType && (
      runner.state.relentlessType === null ||
      runner.state.relentlessType === (resolvingIdxs[0]?.s.bound?.damageType ?? null)
    );
    const triadicActive = distinctCount >= 3;
    const tMult = triadicStrikeMultiplier(distinctCount);
    const tBonus = triadicStrikeBonus(distinctCount);
    const rMult = carriedRelentless ? relentlessMultiplier(runner.state.relentlessStreak) : 1;

    return slots.map((slot, idx) => {
      if (!slot.bound) return null;
      const hits = slot.bound.hits ?? 1;
      const base = slot.bound.damage * hits;
      const willResolve = slot.bound.charge <= 1;
      if (!willResolve) return { base, effective: base, willResolve: false, combo: null };
      const sameCount = counts.get(slot.bound.damageType) ?? 1;
      const onMult = onslaughtMultiplier(sameCount);
      const effective = Math.round(base * onMult * rMult * tMult) + (triadicActive ? tBonus : 0);
      const combo = onslaughtSet.has(idx) ? 'onslaught'
                  : relentlessSet.has(idx) ? 'relentless'
                  : triadicSet.has(idx)    ? 'triadic'
                  : null;
      return { base, effective, willResolve: true, combo } as SlotDmgInfo & object;
    });
  })();
  // Per-slot combo "winding up" state during resolve animation. Set true
  // for the brief pre-volley moment when the slots glow + pulse before
  // their projectiles launch together.
  const [windingUpSlots, setWindingUpSlots] = useState<Set<number>>(new Set());

  // Card-draw animation. When the hand changes (engine drew new cards
  // after endTurn, or Ember Dash drew one), each new card mounts with
  // its index in `drawingCards` set true. A per-card setTimeout (staggered
  // by index) then removes that index — the card's CSS `transition` on
  // `transform` glides it from its offset start position to the fan slot.
  // A `cardDraw` SFX plays at each card's launch moment so each card has
  // an audible card-slip cue.
  // Initialize drawingCards with every starting-hand index so the very
  // first paint shows the cards in their displaced "off-screen" position.
  // Without this initializer, the cards would briefly render at their
  // fan position on first mount, then snap down to the displaced state
  // when the useEffect fires — producing a one-frame flicker. With it,
  // mount → first paint shows cards off-screen → effect schedules their
  // landing via timeouts → CSS transition glides them home.
  const [drawingCards, setDrawingCards] = useState<Set<number>>(() => {
    const initial = new Set<number>();
    for (let i = 0; i < runner.state.hand.length; i++) initial.add(i);
    return initial;
  });
  const prevHandRef = useRef<string[]>([]);

  useEffect(() => {
    const currentHand = runner.state.hand;
    const prev = prevHandRef.current;
    const newDraws: number[] = [];
    for (let i = 0; i < currentHand.length; i++) {
      if (prev[i] !== currentHand[i]) newDraws.push(i);
    }
    if (newDraws.length > 0) {
      // First mount = the run's opening deal. Every card in the starting
      // hand counts as "new" against an empty prev array, so they all
      // animate in. Mid-game draws (after endTurn or Ember Dash) work the
      // same way — only the changed indices animate.
      const isOpeningDeal = prev.length === 0;
      // Stagger paced enough to read each card individually. Opening deal
      // gets a slightly slower stagger because it's typically 5+ cards
      // and the player should see the "dealing in" beat.
      const stagger = isOpeningDeal ? 140 : 110;
      // Brief delay before the first card on opening so the player sees
      // the empty hand area for a beat — gives the deal a sense of
      // anticipation rather than starting mid-animation on mount.
      const initialDelay = isOpeningDeal ? 200 : 0;

      setDrawingCards(prev2 => {
        const next = new Set(prev2);
        for (const idx of newDraws) next.add(idx);
        return next;
      });
      newDraws.forEach((idx, n) => {
        const delay = initialDelay + n * stagger;
        setTimeout(() => {
          sfx.cardDraw();
          setDrawingCards(prev2 => {
            const next = new Set(prev2);
            next.delete(idx);
            return next;
          });
        }, delay);
      });
    }
    prevHandRef.current = [...currentHand];
  }, [runner.state.hand]);

  // Ghost-binding map — preserves slot → cardId across the resolve animation.
  // The engine clears slot bindings the moment endTurn() runs (before the
  // animation sequencer plays), so without this snapshot the slot's icon
  // would vanish to the empty ⬡ glyph as soon as we hit END TURN. We
  // populate it just before the engine call and clear it once the entire
  // sequence completes, so SigilSlot can show the correct card emoji
  // throughout each wind-up + flight + impact phase.
  const [ghostBindings, setGhostBindings] = useState<Map<number, string>>(new Map());
  // Slots whose strike has already landed during the current animation.
  // Used to fade the ghost icon out after impact so the player sees
  // "card consumed" feedback. Null = not in animation.
  const [resolvedGhostSlots, setResolvedGhostSlots] = useState<Set<number>>(new Set());

  // Highest-priority combo for a slot, used for color picking. Order chosen
  // so the most "felt" combo wins when slots overlap (Onslaught is the
  // damage-mover; Relentless rewards commitment; Triadic is a side-bonus).
  function comboColorFor(slotIdx: number): string | null {
    if (onslaughtSet.has(slotIdx)) return '#ff5757';   // crimson
    if (relentlessSet.has(slotIdx)) return '#c084fc';  // arcane purple
    if (triadicSet.has(slotIdx)) return '#7ec4ff';     // frost cyan
    return null;
  }

  const p = runner.state.player;
  const shownPlayerHp = displayedPlayerHp ?? p.currentHp;
  const hpRatio = Math.max(0, shownPlayerHp / Math.max(1, p.stats.maxHp));
  const lowHp = hpRatio < 0.25;
  const playerFlashing = hitFlashes.has('__player__');

  // === Shared subcomponents ===

  // Player bar — avatar + name + HP. Sits at the bottom of the playfield as
  // the player's "card" peer to the enemy cards at the top. The HP banner
  // doubles as the impact-receiver: enemy projectiles fly into this element,
  // which is also the playerHpRef shake target.
  // See ActionCard for the full reasoning — these inner JSX builders are
  // intentionally plain functions (called as `PlayerBar({...})`) instead of
  // React components rendered as <PlayerBar />, so the parent's frequent
  // rerenders don't unmount/remount their DOM and break CSS transitions.
  function PlayerBar({ compact }: { compact: boolean }) {
    const avatarSize = compact ? 40 : 52;
    const hpHeight = compact ? 22 : 28;
    return (
      <div
        key="player-bar"
        ref={(el) => { if (el) playerHpRef.current = el; }}
        className={playerFlashing ? 'sb-shake' : undefined}
        onPointerDown={() => startLongPress(() => { cancelLongPress(); setInfoModal({ kind: 'player' }); })}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        style={{
          display: 'flex', alignItems: 'center', gap: compact ? 8 : 12,
          padding: compact ? '6px 8px' : '8px 12px',
          background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
          border: `2px solid ${playerFlashing ? '#ff6b6b' : 'var(--sb-bronze)'}`,
          borderRadius: 4,
          boxShadow: playerFlashing
            ? '0 0 24px rgba(255,107,107,0.7), inset 0 1px 0 rgba(255,235,180,0.5), inset 0 -1px 0 rgba(0,0,0,0.5)'
            : 'inset 0 1px 0 rgba(255,235,180,0.5), inset 0 -1px 0 rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.6)',
          transition: 'box-shadow 180ms ease, border-color 180ms ease',
          position: 'relative',
        }}
      >
        {/* Avatar */}
        <div style={{
          width: avatarSize, height: avatarSize,
          flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(180deg, var(--sb-parchment) 0%, var(--sb-parchment-dark) 100%)',
          border: '2.5px solid var(--sb-gold)',
          borderRadius: '50%',
          fontSize: avatarSize * 0.55,
          boxShadow: 'inset 0 0 0 1px rgba(255,235,180,0.45), 0 2px 6px rgba(0,0,0,0.6)',
          lineHeight: 1,
        }}>
          {playerAvatar}
        </div>
        {/* Name + HP */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sb-display" style={{
            fontSize: compact ? 11 : 13, fontWeight: 700,
            color: 'var(--sb-gold-light)', letterSpacing: '0.08em',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            marginBottom: 3,
          }}>
            {playerName.toUpperCase()}
          </div>
          {/* HP bar */}
          <div style={{
            position: 'relative',
            height: hpHeight,
            background: 'rgba(0,0,0,0.6)',
            border: '1.5px solid var(--sb-bronze-dark)',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 1, bottom: 1, left: 1,
              width: `calc((100% - 2px) * ${hpRatio})`,
              background: lowHp ? 'var(--sb-crimson-light)' : 'var(--sb-crimson)',
              transition: 'width 240ms cubic-bezier(0.22, 1, 0.36, 1), background 240ms ease',
              boxShadow: lowHp ? '0 0 12px rgba(220,38,38,0.8)' : 'none',
            }} />
            <div className="sb-mono" style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: compact ? 11 : 12, fontWeight: 700,
              color: 'var(--sb-gold-light)',
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
              letterSpacing: '0.05em',
            }}>
              {shownPlayerHp} / {p.stats.maxHp}{p.block > 0 ? `  🛡 ${p.block}` : ''}
            </div>
          </div>
        </div>
      </div>
    );
  };


  function EnemyCard({ e, cardW }: { e: EnemyState; cardW: number; cardH: number }) {
    // While an animation is running, override the displayed HP to whatever
    // the current sequencer step has set. Falls back to live engine state.
    const animatedHp = displayedEnemyHp[e.id];
    const shownHp = animatedHp !== undefined ? animatedHp : e.currentHp;
    const dead = shownHp <= 0;
    const flashing = hitFlashes.has(e.id);
    const selected = selectedEnemyId === e.id && !dead;
    const multipleEnemies = runner.state.enemies.filter(en => en.currentHp > 0).length > 1;

    // Look up the static EnemyDef so the card can render the same way as in
    // the Bestiary. EnemyState carries only runtime fields; the def has the
    // image id, name, archetype, etc.
    const def = getEnemy(e.defId);

    return (
      <div
        key={e.id}
        ref={(el) => {
          if (el) enemyRefs.current.set(e.id, el);
          else enemyRefs.current.delete(e.id);
        }}
        onPointerDown={() => startLongPress(() => { cancelLongPress(); setInfoModal({ kind: 'enemy', enemy: e }); })}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0,
          opacity: dead ? 0.4 : 1,
          filter: dead ? 'grayscale(1)' : flashing ? 'brightness(1.4) saturate(1.4)' : 'none',
          transition: 'opacity 200ms ease, filter 160ms ease',
          cursor: dead ? 'default' : (multipleEnemies ? 'pointer' : 'default'),
          animation: dead ? 'none' : 'breathe 2.5s ease-in-out infinite',
        }}
      >
        {/* Intent telegraph — floats above the card so the player can plan. */}
        <div
          className="sb-mono"
          style={{
            padding: '3px 8px',
            background: dead
              ? 'rgba(60,30,15,0.7)'
              : 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
            border: `1.5px solid ${dead ? '#5b3a1f' : 'var(--sb-bronze)'}`,
            borderRadius: 4,
            color: dead ? '#7f1d1d' : 'var(--sb-gold)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
          }}
        >
          {dead ? '💀 SLAIN' : intentDisplay(e.intent)}
        </div>

        {/* The universal enemy card. Falls back to a sprite-only card if the
            EnemyDef can't be found (defensive — should never happen in prod). */}
        {def ? (
          <EnemyCardDisplay
            enemy={def}
            customWidth={cardW}
            currentHp={shownHp}
            selected={selected}
            onClick={dead ? undefined : () => handleEnemySelect(e.id)}
          />
        ) : (
          <div style={{ width: cardW, height: cardW * 1.4, background: '#222', borderRadius: 8 }} />
        )}

        {selected && (
          <div
            aria-hidden
            className="sb-display"
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.18em',
              background: '#facc15',
              color: '#1a0f0a',
              padding: '2px 7px',
              borderRadius: 3,
              boxShadow: '0 2px 6px rgba(250,204,21,0.5)',
            }}
          >
            ▼ TARGET
          </div>
        )}
      </div>
    );
  }

  function SigilSlot({ slot, slotIdx, size }: {
    slot: typeof runner.state.slots[number]; slotIdx: number; size: number;
  }) {
    // Resolve which card is "in" the slot — prefer the live binding, fall
    // back to the ghost binding (set during animation when the engine has
    // already emptied the slot but the wind-up + flight haven't finished).
    const ghostCardId = ghostBindings.get(slotIdx);
    const liveCardDef = slot.bound ? getAction(slot.bound.cardId) : null;
    const ghostCardDef = !slot.bound && ghostCardId ? getAction(ghostCardId) : null;
    const def = liveCardDef ?? ghostCardDef;
    // The slot visually "has a card" if either the live binding or the
    // ghost is present.
    const hasCardInSlot = !!def;
    // After a strike resolves we mark the ghost as "consumed" — fades the
    // icon out so the player sees feedback that the card has fired.
    const ghostResolved = !slot.bound && resolvedGhostSlots.has(slotIdx);

    const ready = slot.bound && slot.bound.charge === 0;
    const hovered = hoverSlotIdx === slotIdx && draggingHandIdx !== null;
    // Returnable: bound this turn → tap retrieves the card.
    const returnable = !!slot.bound && runner.canReturnSlotToHand(slotIdx);
    // Locked: bound but from a previous turn — visually marked, not tappable.
    const locked = !!slot.bound && !returnable;
    const armed = draggingHandIdx !== null || selectedHandIdx !== null;
    const tappable = armed || returnable;
    // Combo color + wind-up state.
    const comboColor = !!slot.bound ? comboColorFor(slotIdx) : null;
    const windingUp = windingUpSlots.has(slotIdx);

    const borderColor = comboColor && !locked
      ? comboColor
      : ready
        ? 'var(--sb-crimson-light)'
        : locked
          ? '#5b3a1f'
          : (slot.bound ? 'var(--sb-gold)' : 'var(--sb-bronze)');

    const title = locked
      ? 'Locked — bound on a previous turn'
      : returnable
        ? 'Tap to return to hand'
        : armed
          ? 'Tap to bind'
          : '';

    // Box-shadow priority: wind-up pulse > combo glow > ready/bound/locked.
    let boxShadow: string;
    if (windingUp && comboColor) {
      boxShadow = `0 0 36px ${comboColor}, 0 0 18px ${comboColor}, inset 0 0 0 2px ${comboColor}cc`;
    } else if (comboColor && !locked) {
      // Hex-to-rgba isn't worth a helper for two values; use raw rgba blends.
      boxShadow = `0 0 22px ${comboColor}aa, inset 0 0 0 1px ${comboColor}66`;
    } else if (ready) {
      boxShadow = '0 0 22px rgba(220,38,38,0.55), inset 0 0 0 1px rgba(255,235,180,0.25)';
    } else if (locked) {
      boxShadow = 'inset 0 0 0 1px rgba(91,58,31,0.6), 0 2px 6px rgba(0,0,0,0.7)';
    } else {
      boxShadow = slot.bound ? '0 0 14px rgba(251,191,36,0.5)' : 'inset 0 0 0 1px rgba(180,83,9,0.4)';
    }

    // Combo-pulse animation classes — soft pulse during plan phase, faster
    // pulse during the wind-up moment before launch.
    const comboPulseClass = windingUp
      ? 'sb-combo-windup'
      : (comboColor ? 'sb-combo-pulse' : '');

    return (
      <div
        key={slotIdx}
        ref={(el) => {
          if (el) slotRefs.current.set(slotIdx, el);
          else slotRefs.current.delete(slotIdx);
        }}
        onClick={() => handleSlotClick(slotIdx)}
        onDragOver={(ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; setHoverSlotIdx(slotIdx); }}
        onDragEnter={(ev) => { ev.preventDefault(); setHoverSlotIdx(slotIdx); }}
        onDragLeave={() => setHoverSlotIdx(prev => (prev === slotIdx ? null : prev))}
        onDrop={(ev) => {
          ev.preventDefault();
          const handIdxStr = ev.dataTransfer.getData('text/plain');
          const handIdx = parseInt(handIdxStr, 10);
          setHoverSlotIdx(null);
          setDraggingHandIdx(null);
          if (Number.isFinite(handIdx)) handleBindToSlot(handIdx, slotIdx);
        }}
        title={title}
        className={comboPulseClass}
        style={{
          position: 'relative',
          width: size, height: size,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          background: locked
            ? 'linear-gradient(180deg, #1a120a 0%, #0a0604 100%)'
            : 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
          border: `2.5px solid ${borderColor}`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: tappable ? 'pointer' : (locked ? 'not-allowed' : 'default'),
          boxShadow,
          transform: hovered ? 'scale(1.07)' : 'scale(1)',
          transition: 'transform 120ms ease, box-shadow 200ms ease, border-color 200ms ease',
          flexShrink: 0,
          // Slight desaturation on locked so it reads as inert.
          filter: locked ? 'saturate(0.5)' : 'none',
        }}
      >
        {/* Bound card image fills the hex; emoji is the fallback. */}
        {hasCardInSlot && def && (
          <SigilSlotCardArt cardId={def.id} emoji={def.emoji} size={size} dimmed={locked} />
        )}
        <div style={{
          pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          position: 'relative',
          opacity: ghostResolved ? 0 : 1,
          transition: 'opacity 350ms ease-out',
        }}>
          {hasCardInSlot && def ? (
            <div className="sb-mono" style={{
              marginTop: size * 0.55, fontSize: size < 80 ? 10 : 12, fontWeight: 800,
              padding: '2px 6px',
              background: 'rgba(0,0,0,0.78)',
              borderRadius: 4,
              border: `1px solid ${ready ? 'var(--sb-crimson-light)' : (locked ? '#8b6238' : 'var(--sb-gold)')}`,
              color: ready ? 'var(--sb-crimson-light)' : (locked ? '#8b6238' : 'var(--sb-gold)'),
              textShadow: '0 1px 2px rgba(0,0,0,0.95)',
              letterSpacing: '0.04em',
            }}>
              {ready || !slot.bound ? '⚡ READY' : `⏱ ${slot.bound.charge}`}
            </div>
          ) : (
            <div className="sb-display" style={{ fontSize: size * 0.4, color: 'rgba(180,83,9,0.55)' }}>⬡</div>
          )}
        </div>
        {/* Lock badge — small chained padlock at top-right of the hex.
            Pulses subtly to call attention on first sight. */}
        {locked && (
          <div aria-hidden style={{
            position: 'absolute', top: '14%', right: '14%',
            fontSize: size * 0.22, lineHeight: 1,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))',
            color: '#d4c08a',
            pointerEvents: 'none',
          }}>
            🔒
          </div>
        )}
        {/* Same-turn return-affordance hint — tiny ↩ glyph at bottom-left. */}
        {returnable && (
          <div aria-hidden className="sb-mono" style={{
            position: 'absolute', bottom: '12%', left: '50%',
            transform: 'translateX(-50%)',
            fontSize: size < 80 ? 8 : 9,
            color: 'var(--sb-gold-light)',
            opacity: 0.75,
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
            pointerEvents: 'none',
            letterSpacing: '0.06em',
          }}>
            ↩ TAP
          </div>
        )}
      </div>
    );
  };

  // Note: ActionCard is intentionally a plain function (not a React
  // component) and is INVOKED at the JSX call site rather than rendered
  // as <ActionCard />. If it were declared as a component inside the
  // parent's body, every render of CombatView would create a brand-new
  // function reference, which React reconciles as a different component
  // type — unmounting + remounting the DOM nodes on every render. That
  // remount restarts the sb-card-pop-in opacity keyframe and resets the
  // CSS transition baseline, causing a flash on every hover/mouse move.
  // Calling it as a plain function inlines its returned JSX directly.
  function ActionCard({ def, realIndex, i, total, cardW, cardH, fan }: {
    def: NonNullable<ReturnType<typeof getAction>>;
    realIndex: number; i: number; total: number;
    cardW: number; cardH: number;
    fan: { spacing: number; arcMul: number; rotMax: number };
  }) {
    const dragging = draggingHandIdx === realIndex;
    const selected = selectedHandIdx === realIndex;
    const hovered = hoveredHandIdx === realIndex;
    const lifted = hovered || selected;
    // Hide the source card while it's flying to its slot — the overlay
    // replaces it visually so the hand looks like the card has left.
    const isFlyingSource = flying?.handIndex === realIndex;
    const drawing = drawingCards.has(realIndex);

    const center = (total - 1) / 2;
    const offsetIdx = i - center;
    const baseX = offsetIdx * fan.spacing;
    const arcY = Math.abs(offsetIdx) * Math.abs(offsetIdx) * fan.arcMul;
    const fanDeg = total <= 1 ? 0 : (offsetIdx / Math.max(center, 1)) * fan.rotMax;
    const rot = lifted ? 0 : fanDeg;
    const lift = selected ? 28 : (hovered ? 18 : 0);
    const scale = selected ? 1.08 : (hovered ? 1.06 : (dragging ? 0.95 : 1.0));

    return (
      <div
        // Key on the root so React reconciles the card across hover state
        // changes — without it, the function-call invocation produces an
        // unkeyed list and React can't track identity across renders.
        key={`${def.id}-${realIndex}`}
        ref={(el) => {
          if (el) cardRefs.current.set(realIndex, el);
          else cardRefs.current.delete(realIndex);
        }}
        draggable
        onClick={() => handleCardClick(realIndex)}
        onMouseEnter={() => setHoveredHandIdx(realIndex)}
        onMouseLeave={() => setHoveredHandIdx(prev => (prev === realIndex ? null : prev))}
        onDragStart={(ev) => {
          ev.dataTransfer.setData('text/plain', String(realIndex));
          ev.dataTransfer.effectAllowed = 'move';
          setDraggingHandIdx(realIndex);
          setSelectedHandIdx(null);
        }}
        onDragEnd={() => { setDraggingHandIdx(null); setHoverSlotIdx(null); }}
        title={`${def.name} — tap a slot to bind`}
        style={{
          position: 'absolute',
          left: '50%', bottom: 18,
          marginLeft: -cardW / 2,
          width: cardW, height: cardH,
          cursor: 'grab',
          opacity: isFlyingSource ? 0 : drawing ? 0 : (dragging ? 0.4 : 1),
          visibility: isFlyingSource ? 'hidden' : 'visible',
          transformOrigin: 'center center',
          transform: drawing
            ? `translateX(${baseX}px) translateY(280px) rotate(${offsetIdx > 0 ? 22 : -22}deg) scale(0.7)`
            : `translateX(${baseX}px) translateY(${arcY - lift}px) rotate(${rot}deg) scale(${scale})`,
          transition: drawing
            ? `transform 0ms, opacity 0ms`
            : `transform 480ms cubic-bezier(0.34, 1.45, 0.64, 1), ` +
              `opacity 320ms ease-out`,
          willChange: 'transform',
          userSelect: 'none',
          pointerEvents: 'auto',
          zIndex: selected ? 200 : (hovered ? 150 : 10 + i),
        }}
      >
        <ActionCardDisplay
          card={def}
          customWidth={cardW}
          selected={selected || hovered}
        />
      </div>
    );
  };

  function TacticButton({ def, realIndex }: {
    def: NonNullable<ReturnType<typeof getTactic>>; realIndex: number;
  }) {
    const canAfford = runner.state.staminaThisTurn >= def.cost;
    return (
      <div
        key={`${def.id}-${realIndex}`}
        className="flex items-center gap-3 p-2"
        style={{
          background: 'rgba(15,10,7,0.55)',
          border: '1px solid rgba(255,235,180,0.12)',
          borderRadius: 6,
          width: '100%',
          opacity: canAfford ? 1 : 0.55,
        }}
        title={def.description}
      >
        <div style={{ flexShrink: 0 }}>
          <TacticCardDisplay
            card={def}
            customWidth={70}
            disabled={!canAfford}
            onClick={canAfford ? () => handlePlayTactic(realIndex) : undefined}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0, color: '#e2e8f0' }}>
          <div className="sb-display" style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {def.name}
          </div>
          <div className="sb-mono" style={{ fontSize: 10, opacity: 0.85, lineHeight: 1.3, marginTop: 2 }}>
            {def.description}
          </div>
          <div style={{ fontSize: 10, marginTop: 4, color: canAfford ? '#86efac' : '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
            ◆ {def.cost} STAMINA {!canAfford && '· INSUFFICIENT'}
          </div>
        </div>
      </div>
    );
  };

  // === Background + flash overlay (shared) ===
  const Background = (
    <div aria-hidden className="pointer-events-none absolute inset-0" style={{
      backgroundImage: 'repeating-linear-gradient(0deg, rgba(200,168,120,0.05) 0px, rgba(200,168,120,0.05) 1px, transparent 1px, transparent 38px)',
      opacity: 0.6,
    }} />
  );

  // Flying card overlay — rendered at the document root in fixed coords.
  // Position is mutated directly on overlayRef each animation frame; React
  // only re-renders when `flying` becomes set or null.
  const FlyingCardOverlay = flying && (() => {
    const def = flying.def;
    return (
      <div
        ref={overlayRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: 0, top: 0,
          width: flying.cardW, height: flying.cardH,
          // Initial transform — placed at `from` until rAF kicks in. Without
          // this the card flickers at (0,0) for a frame.
          transform: `translate3d(${flying.from.x}px, ${flying.from.y}px, 0)`,
          transformOrigin: 'center center',
          willChange: 'transform, opacity',
          pointerEvents: 'none',
          userSelect: 'none',
          // Trail glow so the card reads as "active" mid-flight.
          filter: 'drop-shadow(0 0 22px rgba(251,191,36,0.85)) drop-shadow(0 12px 22px rgba(0,0,0,0.7))',
          zIndex: 200,
        }}
      >
        <ActionCardDisplay card={def} customWidth={flying.cardW} selected />
      </div>
    );
  })();

  // Projectile overlays — fly from slot/enemy to target. Each one renders
  // a damage-type-styled glow that travels along a CSS-driven transform
  // animation. The duration is set per-projectile so the React layer can
  // align timing with the await spawnProjectile() Promise.
  const ProjectileLayer = projectiles.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 250 }}>
      {projectiles.map(p => {
        const color = damageTypeVfxColor(p.damageType);
        const dx = p.to.x - p.from.x;
        const dy = p.to.y - p.from.y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        // Per-archetype shape: each archetype picks its own width/height,
        // gradient style, and glow intensity. The CSS keyframe handles the
        // travel; we only style the static appearance here.
        let w = 26, h = 26, radius = 13;
        let bg = `radial-gradient(circle, ${color} 0%, ${color}cc 40%, transparent 75%)`;
        let glow = `0 0 18px ${color}, 0 0 36px ${color}99`;
        let extraStyle: React.CSSProperties = {};
        switch (p.archetype) {
          case 'fireball':
            w = 32; h = 32; radius = 16;
            bg = `radial-gradient(circle at 35% 35%, #fff5b8 0%, ${color} 35%, ${color}88 65%, transparent 80%)`;
            glow = `0 0 26px ${color}, 0 0 48px ${color}cc, 0 0 80px ${color}66`;
            break;
          case 'ice_shard':
            w = 36; h = 14; radius = 4;
            bg = `linear-gradient(90deg, transparent 0%, ${color} 30%, #ffffff 50%, ${color} 70%, transparent 100%)`;
            glow = `0 0 14px ${color}, 0 0 28px ${color}aa`;
            extraStyle = { clipPath: 'polygon(0% 50%, 20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%)' };
            break;
          case 'bolt':
            w = 64; h = 4; radius = 2;
            bg = `linear-gradient(90deg, transparent 0%, ${color}88 15%, ${color} 50%, ${color}88 85%, transparent 100%)`;
            glow = `0 0 12px ${color}, 0 0 24px ${color}aa`;
            break;
          case 'arcane_orb':
            w = 28; h = 28; radius = 14;
            bg = `radial-gradient(circle at 35% 35%, #ffffff 0%, ${color} 30%, ${color}55 60%, transparent 80%)`;
            glow = `0 0 22px ${color}, 0 0 44px ${color}cc, inset 0 0 8px #ffffff44`;
            break;
          case 'beam':
            w = Math.hypot(dx, dy);
            h = 4;
            radius = 2;
            bg = `linear-gradient(90deg, ${color}00 0%, ${color} 50%, ${color}00 100%)`;
            glow = `0 0 14px ${color}, 0 0 28px ${color}aa`;
            // Beam: positions at midpoint, doesn't translate.
            break;
          case 'slash':
          case 'smash':
          default:
            // Slash & smash render as a small streak in flight (the real
            // VFX is the slash overlay on impact). Brief visual only.
            w = 40; h = 5; radius = 2;
            bg = `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`;
            glow = `0 0 14px ${color}aa`;
            break;
        }
        if (p.archetype === 'beam') {
          // Static beam — no flight tween.
          return (
            <div
              key={p.id}
              className="sb-beam-fade"
              style={{
                position: 'absolute',
                left: p.from.x,
                top: p.from.y - h / 2,
                width: w, height: h,
                transformOrigin: '0% 50%',
                transform: `rotate(${angle}deg)`,
                borderRadius: radius,
                background: bg,
                boxShadow: glow,
                pointerEvents: 'none',
                ['--proj-duration' as string]: `${p.durationMs}ms`,
              } as React.CSSProperties}
            />
          );
        }
        return (
          <div
            key={p.id}
            className="sb-projectile"
            style={{
              position: 'absolute',
              left: p.from.x - w / 2,
              top: p.from.y - h / 2,
              width: w, height: h,
              transformOrigin: '50% 50%',
              ['--proj-dx' as string]: `${dx}px`,
              ['--proj-dy' as string]: `${dy}px`,
              ['--proj-angle' as string]: `${angle}deg`,
              ['--proj-duration' as string]: `${p.durationMs}ms`,
              borderRadius: radius,
              background: bg,
              boxShadow: glow,
              filter: 'blur(0.4px)',
              pointerEvents: 'none',
              ...extraStyle,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );

  // Slash impact overlay — sweeping arc on the target for slash/smash strikes.
  const SlashLayer = slashes.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 255 }}>
      {slashes.map(s => (
        <div
          key={s.id}
          className="sb-slash"
          style={{
            position: 'absolute',
            left: s.x - s.size / 2,
            top: s.y - 14,
            width: s.size,
            height: 28,
            transform: `rotate(${s.angle}deg)`,
            transformOrigin: 'center center',
            background: `linear-gradient(90deg, transparent 0%, ${s.color}00 5%, ${s.color}cc 25%, #ffffff 50%, ${s.color}cc 75%, ${s.color}00 95%, transparent 100%)`,
            borderRadius: 14,
            filter: `drop-shadow(0 0 10px ${s.color}) drop-shadow(0 0 24px ${s.color}cc)`,
            pointerEvents: 'none',
            ['--slash-duration' as string]: `${s.durationMs}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );

  // Charge-up aura layer — particles gathering on the slot before launch.
  // Charge aura — rendered as a RING, not a filled disc, so the slot's
  // card icon stays clearly visible inside the aura. The radial gradient
  // is transparent in the center (0–55%) and only paints color in the
  // outer band (55–80%, fading to transparent at 100%). The outer
  // box-shadow keeps the soft glow without occluding the icon.
  const ChargeAuraLayer = chargeAuras.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 240 }}>
      {chargeAuras.map(a => (
        <div
          key={a.id}
          className="sb-charge-aura"
          style={{
            position: 'absolute',
            left: a.x - a.size / 2,
            top: a.y - a.size / 2,
            width: a.size,
            height: a.size,
            borderRadius: '50%',
            // Transparent center → bright ring at ~70% radius → transparent edge.
            background: `radial-gradient(circle, transparent 0%, transparent 50%, ${a.color}55 65%, ${a.color}88 75%, ${a.color}33 90%, transparent 100%)`,
            // Outer glow only — no inset shadow that would darken the centre.
            boxShadow: `0 0 ${a.size * 0.4}px ${a.color}77`,
            pointerEvents: 'none',
            ['--aura-duration' as string]: `${a.durationMs}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );

  // Impact ring layer — expanding shockwaves on impact.
  const ImpactRingLayer = impactRings.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 252 }}>
      {impactRings.map(r => (
        <div
          key={r.id}
          className="sb-impact-ring"
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: 0,
            height: 0,
            borderRadius: '50%',
            border: `4px solid ${r.color}`,
            boxShadow: `0 0 24px ${r.color}, inset 0 0 24px ${r.color}aa`,
            pointerEvents: 'none',
            ['--ring-size' as string]: `${r.size}px`,
            ['--ring-duration' as string]: `${r.durationMs}ms`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );

  // Particle burst layer — small particles flying outward from impact point.
  // Each particle is positioned via its index → angle/distance pattern, so
  // bursts feel organic without per-particle React state.
  const ParticleLayer = particles.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 254 }}>
      {particles.map(burst => (
        <div key={burst.id} style={{ position: 'absolute', left: burst.x, top: burst.y, width: 0, height: 0 }}>
          {Array.from({ length: burst.count }).map((_, i) => {
            const angle = (i / burst.count) * Math.PI * 2 + Math.random() * 0.4;
            const distance = 50 + Math.random() * 60;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            const size = burst.archetype === 'fireball' || burst.archetype === 'smash'
              ? 6 + Math.random() * 4
              : burst.archetype === 'ice_shard'
                ? 4 + Math.random() * 3
                : 3 + Math.random() * 3;
            const isShard = burst.archetype === 'ice_shard';
            const isOrb = burst.archetype === 'arcane_orb';
            return (
              <div
                key={i}
                className="sb-particle"
                style={{
                  position: 'absolute',
                  width: isShard ? size * 2 : size,
                  height: size,
                  background: isOrb
                    ? `radial-gradient(circle, #ffffff 0%, ${burst.color} 50%, transparent 80%)`
                    : `radial-gradient(circle, ${burst.color} 0%, ${burst.color}cc 60%, transparent 90%)`,
                  borderRadius: isShard ? '2px' : '50%',
                  boxShadow: `0 0 8px ${burst.color}`,
                  ['--particle-dx' as string]: `${dx}px`,
                  ['--particle-dy' as string]: `${dy}px`,
                  ['--particle-rot' as string]: `${Math.random() * 360}deg`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>
      ))}
    </div>
  );

  // Floating damage numbers + status texts.
  const FloaterLayer = floaters.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 260 }}>
      {floaters.map(f => (
        <div
          key={f.id}
          className="sb-floater"
          style={{
            position: 'absolute',
            left: f.x, top: f.y,
            transform: 'translate(-50%, -50%)',
            color: f.color,
            fontFamily: 'var(--sb-font-display)',
            fontSize: f.crit ? 32 : 22,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textShadow: '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {f.crit && <span style={{ fontSize: '0.7em', marginRight: 4, opacity: 0.9 }}>CRIT!</span>}
          {f.text}
        </div>
      ))}
    </div>
  );

  // Confirmation dialog — end-turn-empty and exit prompts.
  const ConfirmDialogLayer = confirmDialog && (
    <>
      <div
        onClick={() => setConfirmDialog(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.7)' }}
      />
      <div style={{
        position: 'fixed', zIndex: 61,
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'min(320px, calc(100vw - 32px))',
        width: '100%',
        background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
        border: '2px solid var(--sb-gold)',
        borderRadius: 6, padding: '18px 20px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.9)',
        color: 'var(--sb-gold-light)',
        textAlign: 'center',
      }}>
        <div className="sb-display" style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>
          {confirmDialog === 'exit' ? '⚠ FLEE BATTLE?' : '⚠ SKIP TURN?'}
        </div>
        <div className="sb-mono" style={{ fontSize: 11, opacity: 0.8, marginBottom: 16, lineHeight: 1.5 }}>
          {confirmDialog === 'exit'
            ? 'Leaving mid-battle will count as a defeat. Are you sure?'
            : 'No cards are in your slots. End turn without attacking?'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setConfirmDialog(null)}
            style={{
              flex: 1, padding: '8px',
              background: 'var(--sb-leather)', border: '1.5px solid var(--sb-bronze)',
              color: 'var(--sb-gold)', fontFamily: 'var(--sb-font-display)',
              fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 3,
            }}
          >
            CANCEL
          </button>
          <button
            onClick={() => {
              setConfirmDialog(null);
              if (confirmDialog === 'exit') onExit();
              else handleEndTurn(true);
            }}
            style={{
              flex: 1, padding: '8px',
              background: 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
              border: '1.5px solid var(--sb-gold)',
              color: 'var(--sb-gold-light)', fontFamily: 'var(--sb-font-display)',
              fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 3,
            }}
          >
            {confirmDialog === 'exit' ? 'FLEE' : 'SKIP TURN'}
          </button>
        </div>
      </div>
    </>
  );

  // Info modal — shown on long-press of enemy or player card.
  const InfoModal = infoModal && (
    <>
      <div
        onClick={() => setInfoModal(null)}
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.65)' }}
      />
      <div style={{
        position: 'fixed', zIndex: 51,
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'min(340px, calc(100vw - 32px))',
        width: '100%',
        background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
        border: '2px solid var(--sb-gold)',
        borderRadius: 6,
        padding: '14px 16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.85)',
        color: 'var(--sb-gold-light)',
      }}>
        {infoModal.kind === 'enemy' ? (() => {
          const en = infoModal.enemy;
          const rows: [string, string][] = [
            ['HP', `${en.currentHp} / ${en.maxHp}`],
            ['DEF', String(en.def ?? 0)],
            ['Intent', intentDisplay(en.intent)],
            ...Object.entries(en.resistances ?? {})
              .filter(([, v]) => v !== 0)
              .map(([k, v]): [string, string] => [k.toUpperCase(), v > 0 ? `+${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`]),
          ];
          return (
            <>
              <div className="sb-display" style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>
                {en.archetype === 'boss' ? '👑' : '👹'} {en.defId.replace(/_/g, ' ').toUpperCase()}
              </div>
              {rows.map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="sb-mono" style={{ fontSize: 11, opacity: 0.7 }}>{label}</span>
                  <span className="sb-mono" style={{ fontSize: 11, fontWeight: 700 }}>{val}</span>
                </div>
              ))}
            </>
          );
        })() : (() => {
          const stats = p.stats;
          const rows: [string, string][] = [
            ['HP', `${p.currentHp} / ${stats.maxHp}`],
            ['ATK', String(stats.atk)],
            ['DEF', String(stats.def)],
            ['BLOCK', String(p.block)],
            ['CRIT', `${Math.round(stats.critChance * 100)}%`],
            ['DECK', String(runner.state.deck.length)],
            ['DISCARD', String(runner.state.discard.length)],
          ];
          return (
            <>
              <div className="sb-display" style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, letterSpacing: '0.1em' }}>
                {playerAvatar} {playerName.toUpperCase()}
              </div>
              {rows.map(([label, val]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span className="sb-mono" style={{ fontSize: 11, opacity: 0.7 }}>{label}</span>
                  <span className="sb-mono" style={{ fontSize: 11, fontWeight: 700 }}>{val}</span>
                </div>
              ))}
            </>
          );
        })()}
        <button
          onClick={() => setInfoModal(null)}
          style={{
            marginTop: 10, width: '100%', padding: '6px',
            background: 'var(--sb-leather)', border: '1.5px solid var(--sb-bronze)',
            color: 'var(--sb-gold)', fontFamily: 'var(--sb-font-display)',
            fontSize: 11, letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 3,
          }}
        >
          CLOSE
        </button>
      </div>
    </>
  );

  // Damage preview row above the slot hexes. Shows per-slot effective damage
  // and a combo summary banner when a combo is ready.
  function SlotDamageRow({ slotSize, gap }: { slotSize: number; gap: number }) {
    const comboSlots = slotDamagePreview.filter(d => d?.combo && d.willResolve);
    const activeCombo = comboSlots.length > 0 ? comboSlots[0]!.combo : null;
    const comboTotal = comboSlots.reduce((sum, d) => sum + (d?.effective ?? 0), 0);
    const comboColor = activeCombo === 'onslaught' ? '#ff5757'
                     : activeCombo === 'relentless' ? '#c084fc'
                     : '#7ec4ff';
    const comboLabel = activeCombo === 'onslaught' ? '⚔ ONSLAUGHT'
                     : activeCombo === 'relentless' ? '◈ RELENTLESS'
                     : '✦ TRIADIC STRIKE';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {/* Per-slot damage chips aligned with each slot */}
        <div style={{ display: 'flex', gap, alignItems: 'flex-end' }}>
          {slotDamagePreview.map((info, idx) => (
            <div key={idx} style={{
              width: slotSize, display: 'flex', justifyContent: 'center',
            }}>
              {info ? (
                <div className="sb-mono" style={{
                  fontSize: 10, fontWeight: 700,
                  padding: '2px 5px',
                  background: 'rgba(0,0,0,0.7)',
                  border: `1px solid ${info.combo ? comboColor : (info.willResolve ? 'var(--sb-crimson)' : 'var(--sb-bronze-dark)')}`,
                  color: info.combo ? comboColor : (info.willResolve ? 'var(--sb-crimson-light)' : 'rgba(255,235,180,0.45)'),
                  borderRadius: 3,
                  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                  whiteSpace: 'nowrap',
                }}>
                  ⚔ {info.effective}
                </div>
              ) : (
                <div style={{ height: 18 }} />
              )}
            </div>
          ))}
        </div>
        {/* Combo summary banner */}
        {activeCombo && (
          <div className="sb-display" style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            padding: '2px 10px',
            background: `${comboColor}22`,
            border: `1px solid ${comboColor}`,
            color: comboColor,
            borderRadius: 3,
            textShadow: `0 0 8px ${comboColor}`,
            whiteSpace: 'nowrap',
          }}>
            {comboLabel} · {comboTotal} total
          </div>
        )}
      </div>
    );
  }

  const ComboFlashLayer = comboFlash && (
    <div
      aria-live="polite"
      className="sb-combo-flash"
      style={{
        position: 'absolute', zIndex: 30,
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'calc(100% - 24px)',
        textAlign: 'center',
        padding: isMobile ? '10px 22px' : '14px 36px',
        background: comboFlash === 'onslaught' ? 'rgba(185,28,28,0.92)'
                 : comboFlash === 'triadic'    ? 'rgba(79,195,247,0.92)'
                 :                                'rgba(167,139,250,0.92)',
        border: '3px solid var(--sb-gold)',
        color: 'var(--sb-gold-light)',
        fontFamily: 'var(--sb-font-display)',
        fontSize: isMobile ? 18 : 26, fontWeight: 700, letterSpacing: '0.18em',
        textShadow: '0 2px 4px rgba(0,0,0,0.85)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(253,230,138,0.5)',
      }}
    >
      {comboFlash === 'onslaught' && '⚔  ONSLAUGHT  ⚔'}
      {comboFlash === 'triadic'    && '✦  TRIADIC STRIKE  ✦'}
      {comboFlash === 'relentless' && '◈  RELENTLESS  ◈'}
    </div>
  );

  const containerStyle = {
    background: 'radial-gradient(ellipse at top, rgba(185,28,28,0.12) 0%, transparent 55%), linear-gradient(180deg, #0f0a07 0%, #18120e 50%, #0f0a07 100%)',
    color: 'var(--sb-gold-light)',
  } as const;

  // ============================================================
  //                       MOBILE LAYOUT
  // ============================================================
  if (isMobile) {
    // Mobile-friendly hand sizing — adapt to actual card count.
    const total = actionsInHand.length;
    const cardW = total >= 6 ? 68 : total >= 5 ? 73 : 82;
    const cardH = Math.round(cardW * 1.4);
    const spacing = total >= 6 ? 40 : total >= 5 ? 48 : 58;
    const handAreaHeight = cardH + 40;

    const slotSize = runner.state.slots.length >= 5 ? 52 : 60;

    // Adaptive enemy card sizing — fit all cards on screen with overlap if needed.
    // Available width: screen width minus padding (16px total)
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 360;
    const paddingX = 16;
    const availableWidth = screenWidth - paddingX;
    const enemyCount = runner.state.enemies.length;

    // Start with target card width (scale of hand card)
    let enemyCardW = Math.round(cardW * 2.4);
    let enemyCardH = Math.round(cardH * 2.4);
    let enemyGap = 12;

    // Calculate if cards fit without scrolling
    const totalWidthNeeded = enemyCount * enemyCardW + (enemyCount - 1) * enemyGap;

    if (totalWidthNeeded > availableWidth) {
      // Cards don't fit — reduce gap, then shrink cards, then allow overlap
      enemyGap = Math.max(-Math.round(enemyCardW * 0.15), 4); // Gap can go negative for overlap

      const widthWithReducedGap = enemyCount * enemyCardW + (enemyCount - 1) * enemyGap;

      if (widthWithReducedGap > availableWidth) {
        // Still doesn't fit — shrink cards to fit
        enemyCardW = Math.max(
          Math.round((availableWidth - (enemyCount - 1) * enemyGap) / enemyCount),
          60 // Minimum card width
        );
        enemyCardH = Math.round(enemyCardW * 1.4);
      }
    }

    return (
      <div
        className={`relative w-full h-full overflow-hidden flex flex-col ${screenShake === 'heavy' ? 'sb-shake-heavy' : screenShake === 'light' ? 'sb-shake-light' : ''}`}
        style={containerStyle}
      >
        {Background}

        {/* Top status row: flee · stage · turn · hardcore */}
        <div className="relative z-10 flex items-center gap-1.5 px-2 pt-2 pb-1 flex-shrink-0">
          <button
            onClick={() => setConfirmDialog('exit')}
            className="sb-chip"
            style={{ cursor: 'pointer', padding: '4px 8px', fontSize: '10px', flexShrink: 0 }}
          >
            ←
          </button>
          <div className="sb-display flex-1 text-center" style={{
            fontSize: '11px', padding: '5px 8px',
            background: 'linear-gradient(180deg, #3a2a1c 0%, #1a120a 50%, #3a2a1c 100%)',
            border: '2px solid var(--sb-bronze)',
            color: 'var(--sb-gold-light)',
            letterSpacing: '0.12em', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
            boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.3), 0 2px 6px rgba(0,0,0,0.5)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            ⚔ {stage.title.toUpperCase()} · T{runner.state.turn}
          </div>
          {hardcore && (
            <span className="sb-display sb-pulse-crimson" style={{
              fontSize: '9px', padding: '3px 6px',
              background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
              border: '1.5px solid var(--sb-gold)', color: 'var(--sb-gold-light)',
              letterSpacing: '0.18em', flexShrink: 0,
            }}>HC</span>
          )}
        </div>

        {/* Resource chips row — HP moved to the bottom player bar.
            Stamina/deck/discard stay near the top so the player can see
            their resources at a glance. */}
        <div className="relative z-10 flex items-center justify-end gap-1.5 px-2 pb-1.5 flex-shrink-0">
          <span className="sb-chip sb-chip-gold" style={{ fontSize: 10, padding: '3px 6px', flexShrink: 0 }}>
            ⚡{runner.state.staminaThisTurn}
          </span>
          <span className="sb-chip" style={{ fontSize: 10, padding: '3px 6px', flexShrink: 0 }}>
            🃏{runner.state.deck.length}
          </span>
          <span className="sb-chip" style={{ fontSize: 10, padding: '3px 6px', opacity: 0.75, flexShrink: 0 }}>
            🗑{runner.state.discard.length}
          </span>
        </div>

        {/* Enemy row — adaptive sizing to fit all cards on screen */}
        <div
          className="relative z-10 flex justify-center px-2 py-2 flex-shrink-0"
          style={{
            gap: `${enemyGap}px`,
            overflow: 'hidden',
            overflowY: 'visible',
          }}
        >
          {runner.state.enemies.map(e => EnemyCard({ e, cardW: enemyCardW, cardH: enemyCardH }))}
        </div>

        {/* Top spacer — lets the slot row sit closer to vertical center
            rather than getting pushed all the way down to the hand. */}
        <div style={{ flex: 1, minHeight: 4 }} />

        {/* Damage preview above slots + slot row */}
        <div className="relative z-10 flex flex-col items-center gap-2 px-2 py-3 flex-shrink-0" style={{ overflowX: 'auto' }}>
          {SlotDamageRow({ slotSize, gap: 10 })}
          <div style={{ display: 'flex', gap: 10 }}>
            {runner.state.slots.map((slot, slotIdx) => SigilSlot({ slot, slotIdx, size: slotSize }))}
          </div>
        </div>

        {/* Bottom spacer — balances the top spacer to roughly center the slots. */}
        <div style={{ flex: 1, minHeight: 4 }} />

        {/* Tactics chip — anchored to the LEFT edge in the gap between
            the slot row above and the hand fan below. */}
        {tacticsInHand.length > 0 && (
          <div className="relative z-10 flex-shrink-0 px-2 pb-1">
            <button
              onClick={() => setTacticsOpen(o => !o)}
              className="sb-chip"
              style={{
                padding: '5px 12px', fontSize: 11,
                background: tacticsOpen ? 'var(--sb-leather)' : undefined,
                color: tacticsOpen ? 'var(--sb-gold-light)' : undefined,
              }}
            >
              ✦ TACTICS ({tacticsInHand.length})
            </button>
          </div>
        )}

        {/* Hand fan area */}
        <div className="relative flex justify-center items-end flex-shrink-0" style={{
          height: handAreaHeight, pointerEvents: 'none',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
            {actionsInHand.map(({ def, realIndex }, i) =>
              ActionCard({
                def, realIndex, i, total: actionsInHand.length,
                cardW, cardH,
                fan: { spacing, arcMul: 1.0, rotMax: 5 },
              }))}
          </div>
        </div>

        {/* Action bar — END TURN sits ABOVE the player bar so it's the
            first thing the thumb naturally rests on. Tactics chip moved
            up to sit at the hand-vs-plot edge (see below); only the
            END TURN button lives here. */}
        <div className="relative z-20 flex items-stretch gap-2 px-2 pt-2 pb-2 flex-shrink-0" style={{
          background: 'linear-gradient(180deg, transparent 0%, rgba(15,10,7,0.75) 100%)',
        }}>
          <button
            onClick={() => handleEndTurn()}
            disabled={animating}
            style={{
              flex: 1, height: 50,
              background: animating
                ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
                : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
              border: '2.5px solid var(--sb-gold)',
              borderRadius: 6,
              color: animating ? '#8b6238' : 'var(--sb-gold-light)',
              fontFamily: 'var(--sb-font-display)',
              fontSize: 15, fontWeight: 700, letterSpacing: '0.12em',
              cursor: animating ? 'wait' : 'pointer',
              textShadow: '0 1px 2px rgba(0,0,0,0.85)',
              boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.5)',
              opacity: animating ? 0.7 : 1,
            }}
          >
            {animating ? '⚔ RESOLVING…' : '▶ END TURN'}
          </button>
        </div>

        {/* Player profile bar — sits BELOW the END TURN button. Avatar +
            name + HP. Receives enemy projectiles. */}
        <div className="relative z-10 px-2 pb-2 pt-1 flex-shrink-0">
          {PlayerBar({ compact: true })}
        </div>

        {/* Tactics drawer — slides up from above the action bar */}
        {tacticsOpen && tacticsInHand.length > 0 && (
          <>
            {/* Tap-out backdrop */}
            <div
              onClick={() => setTacticsOpen(false)}
              className="absolute inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.5)' }}
            />
            <div className="absolute left-2 right-2 z-40 sb-fade-up" style={{
              bottom: 64,
              background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
              border: '2px solid var(--sb-bronze)',
              borderRadius: 6,
              padding: 8,
              maxHeight: '50vh',
              overflowY: 'auto',
              boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
            }}>
              <div className="sb-display flex items-center justify-between mb-2" style={{
                fontSize: 11, letterSpacing: '0.25em', color: 'var(--sb-gold-light)',
              }}>
                <span>✦ TACTICS ({tacticsInHand.length})</span>
                <button
                  onClick={() => setTacticsOpen(false)}
                  style={{
                    background: 'transparent', border: 'none', color: 'var(--sb-gold)',
                    fontSize: 16, cursor: 'pointer', padding: '0 4px',
                  }}
                  aria-label="Close tactics"
                >×</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {tacticsInHand.map(({ def, realIndex }) => (
                  TacticButton({ def, realIndex })
                ))}
              </div>
            </div>
          </>
        )}

        {ChargeAuraLayer}
        {ComboFlashLayer}
        {FlyingCardOverlay}
        {ProjectileLayer}
        {ImpactRingLayer}
        {SlashLayer}
        {ParticleLayer}
        {FloaterLayer}
        {InfoModal}
        {ConfirmDialogLayer}
      </div>
    );
  }

  // ============================================================
  //                       DESKTOP LAYOUT
  // ============================================================
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${screenShake === 'heavy' ? 'sb-shake-heavy' : screenShake === 'light' ? 'sb-shake-light' : ''}`}
      style={containerStyle}
    >
      <style>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1) translateY(0px) translateX(0px); }
          25% { transform: scale(1.03) translateY(-4px) translateX(-1px); }
          50% { transform: scale(1.04) translateY(-6px) translateX(1px); }
          75% { transform: scale(1.03) translateY(-4px) translateX(-1px); }
        }
      `}</style>
      {Background}

      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
        <span className="sb-display" style={{
          fontSize: '13px', padding: '6px 14px',
          background: 'linear-gradient(180deg, #3a2a1c 0%, #1a120a 50%, #3a2a1c 100%)',
          border: '2px solid var(--sb-bronze)', color: 'var(--sb-gold-light)',
          letterSpacing: '0.18em', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
          boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.3), inset 0 -1px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.5)',
        }}>
          ⚔ {stage.title.toUpperCase()} · TURN {runner.state.turn}
        </span>
        {hardcore && (
          <span className="sb-display sb-pulse-crimson" style={{
            fontSize: '10px', padding: '4px 8px',
            background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
            border: '1.5px solid var(--sb-gold)', color: 'var(--sb-gold-light)',
            letterSpacing: '0.25em',
          }}>HARDCORE</span>
        )}
      </div>

      <button
        onClick={() => setConfirmDialog('exit')}
        className="absolute top-2 left-2 z-20 sb-chip"
        style={{ cursor: 'pointer', padding: '5px 11px', fontSize: '11px' }}
      >
        ← FLEE
      </button>

      <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
        <span className="sb-chip sb-chip-gold" style={{ fontSize: '12px' }}>⚡ {runner.state.staminaThisTurn} STAMINA</span>
        <span className="sb-chip">🃏 {runner.state.deck.length} DECK</span>
        <span className="sb-chip" style={{ opacity: 0.75 }}>🗑 {runner.state.discard.length} DISCARD</span>
      </div>

      {/* Enemy row — uses the same card design + size as the player's hand. */}
      {/* Enemy row — bumped 70% larger to give enemies the visual weight
          they deserve as the focal target. */}
      <div className="absolute z-10 left-0 right-0 flex justify-center gap-3 px-4" style={{ top: 56 }}>
        {runner.state.enemies.map(e => EnemyCard({ e, cardW: 194, cardH: 270 }))}
      </div>

      {/* Sigil slots with damage preview above — pulled toward vertical middle */}
      <div className="absolute z-10 left-0 right-0 flex flex-col items-center gap-2" style={{
        top: '50%', transform: 'translateY(-25%)',
      }}>
        {SlotDamageRow({ slotSize: 92, gap: 16 })}
        <div style={{ display: 'flex', gap: 16 }}>
          {runner.state.slots.map((slot, slotIdx) => SigilSlot({ slot, slotIdx, size: 92 }))}
        </div>
      </div>

      {/* Hand fan — cards bumped 30% (88→114 wide, 122→159 tall) with
          proportional fan spacing.
          Raised to bottom:170 to clear:
            - Player bar at bottom:16 (~76px tall, top edge ~92)
            - END TURN button at bottom:100 (52px tall, top edge ~152)
          Cards sit at bottom:18 inside the fan container (~188 from screen
          bottom), with arc + lift up to ~216, leaving the full hand fan
          comfortably above the END TURN row. */}
      <div className="absolute left-0 right-0 z-10 flex justify-center items-end" style={{
        bottom: 170, height: 220, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'relative',
          width: Math.max(actionsInHand.length, 1) * 100,
          height: '100%', pointerEvents: 'none',
        }}>
          {actionsInHand.map(({ def, realIndex }, i) =>
            ActionCard({
              def, realIndex, i, total: actionsInHand.length,
              cardW: 114, cardH: 159,
              fan: { spacing: 91, arcMul: 1.8, rotMax: 6 },
            }))}
        </div>
      </div>

      {/* END TURN button — sits centered DIRECTLY ABOVE the player HP bar.
          The player bar is at bottom:16 with ~76px height (top edge ~92);
          this button anchors at bottom:100 so its bottom edge is just
          above the player bar's top edge. */}
      <button
        onClick={() => handleEndTurn()}
        disabled={animating}
        className="absolute z-20"
        style={{
          left: '50%', bottom: 100,
          transform: 'translateX(-50%)',
          width: 220, height: 52,
          background: animating
            ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
            : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
          border: '2.5px solid var(--sb-gold)',
          borderRadius: 4,
          color: animating ? '#8b6238' : 'var(--sb-gold-light)',
          fontFamily: 'var(--sb-font-display)',
          fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
          cursor: animating ? 'wait' : 'pointer',
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.6)',
          opacity: animating ? 0.7 : 1,
        }}
      >
        {animating ? '⚔ RESOLVING…' : '▶ END TURN'}
      </button>

      {/* Tactics rail — anchored to the LEFT EDGE of the screen, vertically
          positioned in the gap between the slot row (upper third) and the
          hand fan (lower third). The hand fan starts ~390px above the
          screen bottom; placing the rail at bottom:400 puts it at that
          natural edge between the two play zones. */}
      {tacticsInHand.length > 0 && (
        <div className="absolute z-10 flex flex-col gap-1.5 max-w-[240px] sb-fade-up" style={{
          left: 0, bottom: 400,
          paddingLeft: 10,
        }}>
          <div className="sb-display" style={{ fontSize: 10, letterSpacing: '0.25em', opacity: 0.75, color: 'var(--sb-gold-light)' }}>
            ✦ TACTICS ({tacticsInHand.length})
          </div>
          {tacticsInHand.map(({ def, realIndex }) => TacticButton({ def, realIndex }))}
        </div>
      )}

      {/* Player profile bar — bottom-center, peer to the enemy cards at the
          top. Receives enemy projectiles. Sits below the hand fan. */}
      <div className="absolute z-10" style={{
        left: '50%', bottom: 16,
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100% - 200px))',
      }}>
        {PlayerBar({ compact: false })}
      </div>

      {ChargeAuraLayer}
      {ComboFlashLayer}
      {FlyingCardOverlay}
      {ProjectileLayer}
      {ImpactRingLayer}
      {SlashLayer}
      {ParticleLayer}
      {FloaterLayer}
      {InfoModal}
      {ConfirmDialogLayer}
    </div>
  );
}

// ─── Sigil-slot card art ──────────────────────────────────────────────────────
// Tries the same image fallback chain as GameCard. When no image exists the
// card's emoji is rendered on a dark gradient — keeps the slot legible even
// before assets are added.

function SigilSlotCardArt({ cardId, emoji, size, dimmed }: {
  cardId: string; emoji: string; size: number; dimmed?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const exts = ['png', 'jpg', 'webp'];
  const src = attempt < exts.length ? `/cards/${cardId}.${exts[attempt]}` : null;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {src ? (
        <img
          src={src}
          onError={() => setAttempt(a => a + 1)}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center 25%',
            filter: 'brightness(0.85) contrast(1.05)',
          }}
        />
      ) : (
        <span style={{ fontSize: size * 0.5, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
          {emoji}
        </span>
      )}
    </div>
  );
}
