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
  // Card tier damage multipliers (Phase 3). Maps card id → tier (1..5).
  cardTierMultipliers?: Record<string, number>;
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
  cardTierMultipliers,
  playerName = 'Sigilist', playerAvatar = '🛡️',
  onOutcome, onExit,
}: Props) {
  const isMobile = useIsMobile();

  const { runner, stage } = useMemo(() => {
    const result = buildStageRun({
      stageNumber, playerLevel, equipment, talents, reactions,
      customDeck, initialHp, hardcore, ownedUpgradeIds,
      cardTierMultipliers,
    });
    return { runner: result.runner, stage: result.stage };
  }, [stageNumber, playerLevel, equipment, talents, reactions, customDeck, initialHp, hardcore, ownedUpgradeIds, cardTierMultipliers]);

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
  // Fireball-specific explosion instances — multi-layer flames + smoke.
  const [fireballExplosions, setFireballExplosions] = useState<Array<{
    id: number; x: number; y: number; size: number;
  }>>([]);
  const fireballExplosionIdRef = useRef(0);
  // Screen shake — applied to the playfield container.
  const [screenShake, setScreenShake] = useState<'light' | 'heavy' | null>(null);
  const screenShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Battle outcome announcement — shows dramatic win/lose screen before
  // transitioning to the result screen.
  const [outcomeAnnounce, setOutcomeAnnounce] = useState<null | 'cleared' | 'defeated'>(null);
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
    if (isDealing || animating) return;
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

  // Fireball explosion — bespoke multi-layer flame burst at impact point.
  function spawnFireballExplosion(x: number, y: number, size: number): void {
    const id = ++fireballExplosionIdRef.current;
    setFireballExplosions(list => [...list, { id, x, y, size }]);
    setTimeout(() => setFireballExplosions(list => list.filter(e => e.id !== id)), 1200);
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
          // Layered fiery explosion: flash + rings (white→orange→red) + flames + embers.
          spawnFireballExplosion(cx, cy, r.width);
          spawnImpactRing(cx, cy, '#ffffff', r.width * 0.6, 350);       // white flash ring
          spawnImpactRing(cx, cy, '#ff8c00', r.width * 1.2, 650);       // orange shockwave
          spawnImpactRing(cx, cy, '#ff3300', r.width * 1.8, 900);       // red outer ring
          spawnImpactRing(cx, cy, '#cc1100', r.width * 2.2, 1100);      // deep ember outer
          spawnParticles(cx, cy, color, 'fireball', 20);
          shakeScreen(ev.wasCrit || ev.enemyKilled ? 'heavy' : 'heavy'); // always heavy for fireball
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
        // Layered explosion hitting the player: flash + rings + flames.
        spawnFireballExplosion(cx, cy, Math.min(r.width, 260));
        spawnImpactRing(cx, cy, '#ffffff', Math.min(r.width * 0.45, 140), 320);
        spawnImpactRing(cx, cy, '#ff8c00', Math.min(r.width * 0.85, 260), 600);
        spawnImpactRing(cx, cy, '#ff3300', Math.min(r.width * 1.2, 360), 850);
        spawnParticles(cx, cy, color, 'fireball', 18);
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
    if (animating || isDealing) return;
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

    // Snapshot the hand BEFORE endTurn so we can diff it after.
    const handBefore = [...runner.state.hand];

    const outcome = runner.endTurn();
    const log = runner.getLastResolveLog();

    // Compute which hand indices changed (new cards drawn or positions shifted)
    // and hide them BEFORE repaint() so they never flash visible during the
    // attack animation sequence.
    const handAfter = runner.state.hand;
    const dealIndicesEarly: number[] = [];
    for (let i = 0; i < handAfter.length; i++) {
      if (handBefore[i] !== handAfter[i]) dealIndicesEarly.push(i);
    }
    if (dealIndicesEarly.length > 0) {
      setDrawingCards(prev => {
        const next = new Set(prev);
        for (const idx of dealIndicesEarly) next.add(idx);
        return next;
      });
      setIsDealing(true);
    }

    repaint();
    void playResolveLog(log, comboSlotMap).then(async () => {
      // Sequence done — release the ghosts so the slot row reverts to live
      // engine state (empty slots show ⬡ again).
      setGhostBindings(new Map());
      setResolvedGhostSlots(new Set());
      if (outcome !== 'in_progress') {
        // Show dramatic announcement, then delay before result screen.
        setOutcomeAnnounce(outcome);
        setTimeout(() => {
          setOutcomeAnnounce(null);
          onOutcome(outcome, stage, runner);
        }, 3200);
        return;
      }
      await dealNewCards(dealIndicesEarly);
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

  function handleBindToSlot(realHandIndex: number, slotIndex: number): Promise<void> {
    // Look up DOM rects for the source card and target slot. If either is
    // missing (animation refs not yet attached, off-screen, etc.) commit
    // immediately without animation.
    const cardEl = cardRefs.current.get(realHandIndex);
    const slotEl = slotRefs.current.get(slotIndex);
    const def = getAction(runner.state.hand[realHandIndex] ?? '');
    if (!cardEl || !slotEl || !def) {
      commitBind(realHandIndex, slotIndex);
      return Promise.resolve();
    }

    // Validate the bind would succeed before kicking off the animation —
    // otherwise we'd fly the card just to bounce it back.
    const slot = runner.state.slots[slotIndex];
    if (!slot || slot.bound) {
      commitBind(realHandIndex, slotIndex); // engine will reject and no-op
      return Promise.resolve();
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

    return new Promise<void>((resolve) => {
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
          resolve();
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
    });
  }

  function handleSlotClick(slotIndex: number): void {
    if (isDealing || animating) return;
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
    if (isDealing || animating) return;
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

  // Auto-battle solver — picks the best assignment of hand cards to empty slots,
  // then plays each card placement as a full flying animation (one at a time,
  // sequential) exactly like a real player would, then fires END TURN.
  //
  // Strategy (scored permutation search):
  //   Score each candidate assignment using the real combo multiplier functions
  //   (Onslaught, Relentless, Triadic). The search space is tiny (hand ≤ 8,
  //   slots ≤ 4 → worst case 1680 permutations) so brute-force is instant.
  async function handleAutoBattle(): Promise<void> {
    if (animating || isDealing) return;

    const state = runner.state;
    const emptySlotIdxs = state.slots
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.bound)
      .map(({ i }) => i);

    // Action cards only — tactics aren't placed in slots.
    const actionHandIdxs: number[] = [];
    for (let i = 0; i < state.hand.length; i++) {
      if (getAction(state.hand[i] ?? '')) actionHandIdxs.push(i);
    }

    const slotsToFill = Math.min(emptySlotIdxs.length, actionHandIdxs.length);
    if (slotsToFill === 0) {
      handleEndTurn(true);
      return;
    }

    // Score a candidate assignment using the same combo formulas as the preview.
    function scoreAssignment(pairs: Array<{ handIdx: number; slotIdx: number }>): number {
      const typeCounts = new Map<string, number>();
      for (const slot of state.slots) {
        if (slot.bound && slot.bound.charge <= 1) {
          typeCounts.set(slot.bound.damageType, (typeCounts.get(slot.bound.damageType) ?? 0) + 1);
        }
      }
      const candidateDefs: Array<{ damage: number; damageType: string; charge: number; hits: number }> = [];
      for (const { handIdx } of pairs) {
        const cardId = state.hand[handIdx] ?? '';
        const def = getAction(cardId);
        if (!def) continue;
        candidateDefs.push({ damage: def.damage, damageType: def.damageType, charge: def.charge, hits: def.hits ?? 1 });
        if (def.charge <= 0) {
          typeCounts.set(def.damageType, (typeCounts.get(def.damageType) ?? 0) + 1);
        }
      }
      const distinctTypes = typeCounts.size;
      const tMult = triadicStrikeMultiplier(distinctTypes);
      const tBonus = triadicStrikeBonus(distinctTypes);
      const triadicActive = distinctTypes >= 3;
      const allOneType = distinctTypes === 1;
      const streakType = state.relentlessType;
      const firstType = typeCounts.keys().next().value as string | undefined;
      const carriedRelentless = allOneType && (streakType === null || streakType === firstType);
      const rMult = carriedRelentless ? relentlessMultiplier(state.relentlessStreak) : 1;
      let total = 0;
      for (const c of candidateDefs) {
        if (c.charge > 0) { total += c.damage * 0.15; continue; }
        const sameCount = typeCounts.get(c.damageType) ?? 1;
        const onMult = onslaughtMultiplier(sameCount);
        const base = c.damage * c.hits;
        total += Math.round(base * onMult * rMult * tMult) + (triadicActive ? tBonus : 0);
      }
      return total;
    }

    // Find the best assignment via permutation search.
    let bestScore = -1;
    let bestPairs: Array<{ handIdx: number; slotIdx: number }> = [];
    function permute(chosen: number[], remaining: number[]): void {
      if (chosen.length === slotsToFill) {
        const pairs = chosen.map((handIdx, pi) => ({ handIdx, slotIdx: emptySlotIdxs[pi]! }));
        const score = scoreAssignment(pairs);
        if (score > bestScore) { bestScore = score; bestPairs = pairs; }
        return;
      }
      for (let i = 0; i < remaining.length; i++) {
        permute([...chosen, remaining[i]!], remaining.filter((_, j) => j !== i));
      }
    }
    permute([], actionHandIdxs);

    // Play each placement as a real animated card flight, one at a time.
    // Because each flight removes a card from the hand, hand indices shift
    // downward for every card placed — we sort by original handIdx ascending
    // and track the running offset.
    const sortedPairs = [...bestPairs].sort((a, b) => a.handIdx - b.handIdx);
    let offset = 0;
    for (const { handIdx, slotIdx } of sortedPairs) {
      // Wait one frame so React has committed the updated hand/slot DOM from
      // the previous bind before we read the next card's getBoundingClientRect.
      await new Promise<void>(r => requestAnimationFrame(() => r()));
      await handleBindToSlot(handIdx - offset, slotIdx);
      offset++;
      // Brief pause between placements — feels like a human thinking.
      await new Promise<void>(r => setTimeout(r, 120));
    }

    // Short pause after last card lands before END TURN fires.
    await new Promise<void>(r => setTimeout(r, 220));
    handleEndTurn(true);
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

  // ── Card-deal animation system ────────────────────────────────────────────
  // Cards are dealt one-at-a-time at the start of each turn: each card flies
  // from the deck-pile position (bottom-right of the viewport) to its fan
  // slot using a rAF tween (same approach as handleBindToSlot bind anim).
  //
  // `drawingCards`  — Set of hand indices whose DOM card should stay hidden
  //                   (invisible) because the deal overlay is still in flight
  //                   for them, or they haven't been dealt yet this phase.
  // `isDealing`     — true while ANY card is in-flight or queued; blocks all
  //                   player input (clicks, end turn, auto battle).
  // `dealOverlay`   — the single in-flight deal card rendered as a fixed-pos
  //                   overlay that rAF drives to the destination.

  const [drawingCards, setDrawingCards] = useState<Set<number>>(() => {
    // Start with all opening-hand indices hidden — dealOpeningHand fires on
    // mount and animates them in sequentially.
    const initial = new Set<number>();
    for (let i = 0; i < runner.state.hand.length; i++) initial.add(i);
    return initial;
  });

  const [isDealing, setIsDealing] = useState(true); // locked until opening deal done

  const [dealOverlay, setDealOverlay] = useState<null | {
    def: NonNullable<ReturnType<typeof getAction>>;
    cardW: number; cardH: number;
    from: { x: number; y: number };
    to:   { x: number; y: number };
    flipped: boolean; // true once card face should show (mid-flight flip)
  }>(null);
  const dealOverlayRef = useRef<HTMLDivElement | null>(null);
  const dealFrameRef = useRef<number | null>(null);

  useEffect(() => {
    return () => { if (dealFrameRef.current) cancelAnimationFrame(dealFrameRef.current); };
  }, []);

  // Animate one card from `from` (deck origin) to `to` (fan slot rect).
  // Returns a promise that resolves when the card lands.
  function animateDealCard(
    def: NonNullable<ReturnType<typeof getAction>>,
    cardW: number, cardH: number,
    from: { x: number; y: number },
    to:   { x: number; y: number },
  ): Promise<void> {
    return new Promise<void>(resolve => {
      setDealOverlay({ def, cardW, cardH, from, to, flipped: false });

      const duration = 420;
      const flipAt   = 0.45; // fraction of flight where card face reveals
      const startTime = performance.now();

      const tick = (now: number) => {
        const t      = Math.min(1, (now - startTime) / duration);
        const eased  = easeOutCubic(t);

        const dx = from.x + (to.x - from.x) * eased;
        const dy = from.y + (to.y - from.y) * eased;

        // Parabolic arc — card rises toward the player's hand.
        const travel   = Math.hypot(to.x - from.x, to.y - from.y);
        const arcAmt   = Math.min(160, travel * 0.5);
        const arcOffset = Math.sin(eased * Math.PI) * arcAmt;

        // Slight clockwise rotation that straightens as it arrives.
        const dirSign  = Math.sign(to.x - from.x) || -1;
        const rot      = (1 - eased) * 18 * dirSign;

        // Scale: card grows slightly as it crosses mid-screen, then lands at 1.
        const apexScale = 1.12;
        const sc = eased < 0.5
          ? 1 + (apexScale - 1) * (eased / 0.5)
          : apexScale + (1 - apexScale) * ((eased - 0.5) / 0.5);

        const el = dealOverlayRef.current;
        if (el) {
          el.style.transform =
            `translate3d(${dx}px, ${dy - arcOffset}px, 0) ` +
            `rotate(${rot}deg) scale(${sc})`;
          el.style.opacity = String(t < 0.95 ? 1 : 1 - (t - 0.95) / 0.05);
        }

        // Flip the card face-up at the midpoint.
        if (t >= flipAt) {
          setDealOverlay(prev => prev && !prev.flipped ? { ...prev, flipped: true } : prev);
        }

        if (t < 1) {
          dealFrameRef.current = requestAnimationFrame(tick);
        } else {
          dealFrameRef.current = null;
          setDealOverlay(null);
          resolve();
        }
      };

      if (dealFrameRef.current) cancelAnimationFrame(dealFrameRef.current);
      dealFrameRef.current = requestAnimationFrame(tick);
    });
  }

  // Deal `indices` sequentially. Called from handleEndTurn (post-resolve) and
  // on mount for the opening hand.
  async function dealNewCards(indices: number[]): Promise<void> {
    if (indices.length === 0) return;
    setIsDealing(true);
    // Mark all indices as hidden so they don't show in the fan prematurely.
    setDrawingCards(prev => {
      const next = new Set(prev);
      for (const idx of indices) next.add(idx);
      return next;
    });

    // Measure the viewport so we can place the deck origin at bottom-right.
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Deck pile sits at bottom-right corner — card back stack visual.
    const deckOrigin = { x: vw - 60, y: vh - 60 };

    // Determine card dimensions from the first available cardRef, or use a default.
    const firstRef = cardRefs.current.get(indices[0] ?? -1)
      ?? (cardRefs.current.values().next().value as HTMLDivElement | undefined);
    const sampleW = firstRef?.offsetWidth  ?? 82;
    const sampleH = firstRef?.offsetHeight ?? 115;

    for (const idx of indices) {
      // Wait a frame so React has committed the hand render for this index
      // before we read its DOM rect.
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      const cardEl = cardRefs.current.get(idx);
      let to = { x: vw / 2 - sampleW / 2, y: vh - sampleH - 80 }; // fallback center-bottom
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        to = { x: rect.left, y: rect.top };
      }

      const def = getAction(runner.state.hand[idx] ?? '');
      if (!def) {
        // Non-action card (tactic) — just unhide it instantly.
        setDrawingCards(prev => { const n = new Set(prev); n.delete(idx); return n; });
        continue;
      }

      sfx.cardDraw();
      await animateDealCard(def, sampleW, sampleH, deckOrigin, to);

      // Reveal the real card in the fan and remove from hidden set.
      setDrawingCards(prev => { const n = new Set(prev); n.delete(idx); return n; });
      repaint();

      // Brief pause between each card — like a human dealing.
      if (indices.indexOf(idx) < indices.length - 1) {
        await new Promise<void>(r => setTimeout(r, 80));
      }
    }

    setIsDealing(false);
  }

  // Opening deal — fires once on mount.
  const openingDealFiredRef = useRef(false);
  useEffect(() => {
    if (openingDealFiredRef.current) return;
    openingDealFiredRef.current = true;
    const indices: number[] = [];
    for (let i = 0; i < runner.state.hand.length; i++) indices.push(i);
    // Brief pause before first card so the board settles.
    setTimeout(() => { void dealNewCards(indices); }, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Decorative golden sigil border strip — rendered at top and bottom of the
  // battle screen. Inline JSX so it can't be clipped by pseudo-element rules.
  function SigilBorder({ position }: { position: 'top' | 'bottom' }) {
    const glyphs = '◆  ✦  ✦  ◆  ✦  ✦  ◆  ✦  ✦  ◆  ✦  ✦  ◆  ✦  ✦  ◆';
    return (
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0, right: 0,
          [position]: 0,
          height: 20,
          zIndex: 30,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          justifyContent: position === 'top' ? 'flex-start' : 'flex-end',
        }}
      >
        {/* Glow halo — wide soft bloom behind the line */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          [position]: 0,
          height: 18,
          background: position === 'top'
            ? 'linear-gradient(180deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.06) 60%, transparent 100%)'
            : 'linear-gradient(0deg,   rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.06) 60%, transparent 100%)',
          pointerEvents: 'none',
        }} />
        {/* The golden shimmer line itself */}
        <div
          className="sb-sigil-line"
          style={{
            height: 2,
            flexShrink: 0,
            boxShadow: '0 0 6px rgba(251,191,36,0.8), 0 0 14px rgba(251,191,36,0.4)',
          }}
        />
        {/* Glyph row — sits just inside (below top line / above bottom line) */}
        <div style={{
          textAlign: 'center',
          fontSize: 7,
          letterSpacing: '1em',
          color: '#fbbf24',
          opacity: 0.7,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textShadow: '0 0 5px rgba(251,191,36,0.9)',
          lineHeight: '10px',
          height: 10,
          flexShrink: 0,
          paddingLeft: '0.5em',
        }}>
          {glyphs}
        </div>
      </div>
    );
  }

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


  function EnemyCard({ e, cardW, cardH, isBossEnemy }: {
    e: EnemyState; cardW: number; cardH: number; isBossEnemy?: boolean;
  }) {
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
          gap: isBossEnemy ? 6 : 4,
          flexShrink: 0,
          opacity: dead ? 0.4 : 1,
          filter: dead ? 'grayscale(1)' : flashing ? 'brightness(1.4) saturate(1.4)' : 'none',
          transition: 'opacity 200ms ease, filter 160ms ease',
          cursor: dead ? 'default' : (multipleEnemies ? 'pointer' : 'default'),
          animation: dead ? 'none' : 'breathe 2.5s ease-in-out infinite',
          // Boss card sits slightly lower so its top aligns with minion tops
          // despite being taller — gives it a "rising from the earth" feel.
          alignSelf: isBossEnemy ? 'flex-end' : undefined,
        }}
      >
        {/* Boss crown badge */}
        {isBossEnemy && !dead && (
          <div style={{
            fontFamily: 'var(--sb-font-display)',
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.22em',
            color: '#fbbf24',
            textShadow: '0 0 10px rgba(251,191,36,0.8), 0 1px 2px rgba(0,0,0,0.9)',
            marginBottom: -2,
          }}>
            ♛ BOSS
          </div>
        )}

        {/* Intent telegraph — floats above the card so the player can plan. */}
        <div
          className="sb-mono"
          style={{
            padding: '3px 8px',
            background: dead
              ? 'rgba(60,30,15,0.7)'
              : isBossEnemy
                ? 'linear-gradient(180deg, #3d1a0a 0%, #1a0f0a 100%)'
                : 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
            border: `1.5px solid ${dead ? '#5b3a1f' : isBossEnemy ? '#fbbf24' : 'var(--sb-bronze)'}`,
            borderRadius: 4,
            color: dead ? '#7f1d1d' : isBossEnemy ? '#fde68a' : 'var(--sb-gold)',
            fontSize: isBossEnemy ? 12 : 11,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textShadow: isBossEnemy ? '0 0 6px rgba(251,191,36,0.5), 0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            maxWidth: cardW + 8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            boxShadow: isBossEnemy && !dead ? '0 0 12px rgba(251,191,36,0.3)' : 'none',
          }}
        >
          {dead ? '💀 SLAIN' : intentDisplay(e.intent)}
        </div>

        {/* The universal enemy card. Boss gets a golden glow wrapper. */}
        <div style={isBossEnemy && !dead ? {
          borderRadius: 10,
          boxShadow: '0 0 0 2px #fbbf24, 0 0 24px rgba(251,191,36,0.45), 0 0 48px rgba(185,28,28,0.3)',
          flexShrink: 0,
        } : undefined}>
          {def ? (
            <EnemyCardDisplay
              enemy={def}
              customWidth={cardW}
              currentHp={shownHp}
              selected={selected}
              onClick={dead ? undefined : () => handleEnemySelect(e.id)}
            />
          ) : (
            <div style={{ width: cardW, height: cardH, background: '#222', borderRadius: 8 }} />
          )}
        </div>

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

  // Damage-type accent colors for slot card tinting.
  const dmgTypeColor = (t: string): string => {
    switch (t) {
      case 'pyre':   return '#f97316';
      case 'frost':  return '#7ec4ff';
      case 'arcane': return '#c084fc';
      case 'pierce': return '#fde68a';
      case 'dark':   return '#a78bfa';
      case 'nature': return '#4ade80';
      case 'holy':   return '#fde68a';
      case 'thunder':return '#facc15';
      case 'steel':
      default:       return '#cbd5e1';
    }
  };

  // Slot card — redesigned rectangular card replacing the hexagon.
  // Shows: card emoji + name, damage preview, charge pips, damage-type color.
  function SigilSlot({ slot, slotIdx, cardW, cardH }: {
    slot: typeof runner.state.slots[number]; slotIdx: number; cardW: number; cardH: number;
  }) {
    const ghostCardId = ghostBindings.get(slotIdx);
    const liveCardDef = slot.bound ? getAction(slot.bound.cardId) : null;
    const ghostCardDef = !slot.bound && ghostCardId ? getAction(ghostCardId) : null;
    const def = liveCardDef ?? ghostCardDef;
    const hasCard = !!def;
    const ghostResolved = !slot.bound && resolvedGhostSlots.has(slotIdx);

    const ready = slot.bound && slot.bound.charge === 0;
    const hovered = hoverSlotIdx === slotIdx && draggingHandIdx !== null;
    const returnable = !!slot.bound && runner.canReturnSlotToHand(slotIdx);
    const locked = !!slot.bound && !returnable;
    const armed = draggingHandIdx !== null || selectedHandIdx !== null;
    const tappable = armed || returnable;
    const comboColor = !!slot.bound ? comboColorFor(slotIdx) : null;
    const windingUp = windingUpSlots.has(slotIdx);

    // Damage preview for this slot.
    const dmgInfo = slotDamagePreview[slotIdx];
    const typeColor = slot.bound ? dmgTypeColor(slot.bound.damageType) : '#94a3b8';
    const charge = slot.bound ? slot.bound.charge : 0;

    // Animation class.
    const animClass = windingUp
      ? 'sb-slot-windup'
      : comboColor && !locked
        ? 'sb-slot-combo'
        : (ready && hasCard ? 'sb-slot-ready' : '');

    const borderColor = comboColor && !locked
      ? comboColor
      : locked ? '#5b3a1f'
      : ready ? 'var(--sb-crimson-light)'
      : hasCard ? 'var(--sb-gold)'
      : 'rgba(180,83,9,0.4)';

    const title = locked ? 'Locked — bound on a previous turn'
      : returnable ? 'Tap to return to hand'
      : armed ? 'Tap to bind card'
      : '';

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
        className={animClass}
        style={{
          position: 'relative',
          width: cardW,
          height: cardH,
          borderRadius: 8,
          background: !hasCard
            ? 'linear-gradient(180deg, rgba(20,12,8,0.7) 0%, rgba(10,6,4,0.8) 100%)'
            : locked
              ? 'linear-gradient(180deg, #1a120a 0%, #0c0804 100%)'
              : comboColor
                ? `linear-gradient(180deg, color-mix(in srgb, ${comboColor} 18%, #1a0f0a) 0%, #1a0f0a 100%)`
                : `linear-gradient(180deg, color-mix(in srgb, ${typeColor} 10%, #2a1810) 0%, #1a0f0a 100%)`,
          border: `2px solid ${borderColor}`,
          cursor: tappable ? 'pointer' : locked ? 'not-allowed' : 'default',
          transform: hovered ? 'scale(1.06) translateY(-3px)' : 'scale(1)',
          transition: 'transform 120ms ease, border-color 200ms ease',
          filter: locked ? 'saturate(0.45)' : 'none',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ['--slot-combo-color' as string]: comboColor ?? '#ff5757',
        } as React.CSSProperties}
      >
        {/* ── Top accent bar — colored by damage type / combo ── */}
        <div style={{
          height: 3,
          background: comboColor ?? typeColor,
          opacity: hasCard ? 1 : 0.2,
          boxShadow: hasCard ? `0 0 8px ${comboColor ?? typeColor}` : 'none',
          flexShrink: 0,
          transition: 'background 200ms ease, opacity 200ms ease',
        }} />

        {/* ── Card content ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: hasCard ? 'space-between' : 'center',
            padding: '4px 4px 5px',
            opacity: ghostResolved ? 0 : 1,
            transition: 'opacity 350ms ease-out',
            position: 'relative',
          }}
        >
          {hasCard && def ? (
            <>
              {/* Slot number badge — top-left */}
              <div style={{
                position: 'absolute', top: 0, left: 2,
                fontFamily: 'var(--sb-font-mono)',
                fontSize: 8,
                color: 'rgba(255,235,180,0.35)',
                letterSpacing: '0.04em',
                lineHeight: 1,
              }}>
                {slotIdx + 1}
              </div>

              {/* Lock / return badge — top-right */}
              {locked && (
                <div style={{ position: 'absolute', top: 0, right: 2, fontSize: cardH < 80 ? 9 : 11, lineHeight: 1 }}>
                  🔒
                </div>
              )}
              {returnable && !locked && (
                <div style={{
                  position: 'absolute', top: 0, right: 2,
                  fontFamily: 'var(--sb-font-mono)',
                  fontSize: 8, color: 'var(--sb-gold-light)', opacity: 0.7,
                }}>↩</div>
              )}

              {/* Card emoji — large, centered */}
              <div style={{
                fontSize: cardH < 80 ? 18 : 24,
                lineHeight: 1,
                filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.8)) drop-shadow(0 0 6px ${typeColor}88)`,
                marginTop: 6,
                flexShrink: 0,
              }}>
                {def.emoji}
              </div>

              {/* Card name — truncated */}
              <div style={{
                fontFamily: 'var(--sb-font-display)',
                fontSize: cardH < 80 ? 7 : 8,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: 'var(--sb-gold-light)',
                textAlign: 'center',
                lineHeight: 1.1,
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                padding: '0 2px',
                flexShrink: 0,
              }}>
                {def.name.toUpperCase()}
              </div>

              {/* Bottom row: damage + charge pips */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0 2px',
                gap: 2,
                flexShrink: 0,
              }}>
                {/* Damage preview */}
                <div style={{
                  fontFamily: 'var(--sb-font-mono)',
                  fontSize: cardH < 80 ? 9 : 11,
                  fontWeight: 800,
                  color: dmgInfo?.combo ? (comboColor ?? typeColor) : (ready ? 'var(--sb-crimson-light)' : typeColor),
                  textShadow: dmgInfo?.combo ? `0 0 8px ${comboColor ?? typeColor}` : 'none',
                  letterSpacing: '0.02em',
                  lineHeight: 1,
                  flexShrink: 0,
                }}>
                  {dmgInfo ? `⚔${dmgInfo.effective}` : (slot.bound ? `⚔${slot.bound.damage}` : '')}
                </div>

                {/* Charge pips */}
                <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
                  {ready ? (
                    <div style={{
                      fontFamily: 'var(--sb-font-mono)',
                      fontSize: 7,
                      color: 'var(--sb-crimson-light)',
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      textShadow: '0 0 6px rgba(220,38,38,0.8)',
                    }}>▶</div>
                  ) : charge > 0 ? (
                    Array.from({ length: Math.min(charge, 4) }).map((_, i) => (
                      <span
                        key={i}
                        className="sb-charge-pip"
                        style={{ '--pip-color': typeColor } as React.CSSProperties}
                      />
                    ))
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            /* Empty slot — dashed invite */
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              opacity: hovered ? 0.8 : 0.3,
              transition: 'opacity 150ms ease',
            }}>
              <div style={{ fontFamily: 'var(--sb-font-display)', fontSize: cardH < 80 ? 16 : 22, color: 'rgba(180,83,9,0.6)' }}>
                ⬡
              </div>
              <div style={{
                fontFamily: 'var(--sb-font-mono)',
                fontSize: 7,
                color: 'rgba(255,235,180,0.4)',
                letterSpacing: '0.1em',
                lineHeight: 1,
              }}>
                {slotIdx + 1}
              </div>
            </div>
          )}
        </div>

        {/* ── Drop-target highlight rim ── */}
        {hovered && (
          <div style={{
            position: 'absolute', inset: 0,
            borderRadius: 7,
            border: '2px solid var(--sb-gold)',
            boxShadow: 'inset 0 0 16px rgba(251,191,36,0.3)',
            pointerEvents: 'none',
          }} />
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

  // Card-back placeholder used during the deal animation flip.
  const CardBack = ({ width, height }: { width: number; height: number }) => (
    <div style={{
      width, height,
      borderRadius: 8,
      background: 'linear-gradient(145deg, #1a2a4a 0%, #0d1a2e 60%, #12223b 100%)',
      border: '1.5px solid rgba(126,196,255,0.35)',
      boxShadow: 'inset 0 0 14px rgba(0,60,120,0.6), inset 0 2px 0 rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* diamond pattern */}
      <div style={{
        width: width * 0.62, height: height * 0.62,
        border: '1.5px solid rgba(126,196,255,0.22)',
        transform: 'rotate(45deg)',
        boxShadow: '0 0 8px rgba(126,196,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          width: width * 0.28, height: height * 0.28,
          border: '1px solid rgba(126,196,255,0.28)',
          transform: 'rotate(0deg)',
          background: 'radial-gradient(circle, rgba(126,196,255,0.12) 0%, transparent 80%)',
        }} />
      </div>
    </div>
  );

  // Deal card overlay — same pattern as FlyingCardOverlay but uses
  // dealOverlayRef and shows a card-back → face flip during flight.
  const DealCardOverlay = dealOverlay && (
    <div
      ref={dealOverlayRef}
      aria-hidden
      style={{
        position: 'fixed',
        left: 0, top: 0,
        width: dealOverlay.cardW, height: dealOverlay.cardH,
        transform: `translate3d(${dealOverlay.from.x}px, ${dealOverlay.from.y}px, 0)`,
        transformOrigin: 'center center',
        willChange: 'transform, opacity',
        pointerEvents: 'none',
        userSelect: 'none',
        filter: 'drop-shadow(0 0 18px rgba(126,196,255,0.7)) drop-shadow(0 8px 18px rgba(0,0,0,0.8))',
        zIndex: 210,
      }}
    >
      {dealOverlay.flipped
        ? <ActionCardDisplay card={dealOverlay.def} customWidth={dealOverlay.cardW} />
        : <CardBack width={dealOverlay.cardW} height={dealOverlay.cardH} />
      }
    </div>
  );

  // ── Battle outcome announcement ──────────────────────────────────────────
  // Shown for ~3.2 s after battle ends, before the result screen appears.
  // WIN  → gold burst + dramatic text sweep
  // LOSE → red desaturating vignette + heavy text drop
  const OutcomeAnnounceLayer = outcomeAnnounce && (() => {
    const isWin = outcomeAnnounce === 'cleared';
    // Particle seeds — deterministic so they're stable while layer mounts.
    const particles = Array.from({ length: isWin ? 24 : 14 }, (_, i) => {
      const angle = (i / (isWin ? 24 : 14)) * Math.PI * 2;
      const dist  = 120 + (i % 3) * 80;
      return {
        px: `${Math.cos(angle) * dist}px`,
        py: `${Math.sin(angle) * dist}px`,
        delay: `${(i * 0.04).toFixed(2)}s`,
        size: 6 + (i % 4) * 4,
        color: isWin
          ? ['#fbbf24', '#f59e0b', '#fde68a', '#fff7d6'][i % 4]
          : ['#ef4444', '#dc2626', '#fca5a5', '#7f1d1d'][i % 4],
      };
    });

    return (
      <div
        aria-live="assertive"
        style={{
          position: 'fixed', inset: 0,
          zIndex: 500,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
          animation: 'sb-outcome-bg-in 0.35s ease-out forwards',
          background: isWin
            ? 'radial-gradient(ellipse at 50% 45%, rgba(251,191,36,0.18) 0%, rgba(180,100,0,0.22) 40%, rgba(0,0,0,0.88) 100%)'
            : 'radial-gradient(ellipse at 50% 45%, rgba(220,38,38,0.22) 0%, rgba(100,0,0,0.32) 40%, rgba(0,0,0,0.92) 100%)',
        }}
      >
        {/* Scanline sweep for dramatic feel */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0,
          background: isWin
            ? 'linear-gradient(180deg, transparent 0%, rgba(251,191,36,0.06) 50%, transparent 100%)'
            : 'linear-gradient(180deg, transparent 0%, rgba(220,38,38,0.08) 50%, transparent 100%)',
          height: '60px', width: '100%',
          animation: 'sb-outcome-scanline 1.2s ease-in-out 0.1s forwards',
          pointerEvents: 'none',
        }} />

        {/* Particle burst */}
        {particles.map((p, i) => (
          <div key={i} aria-hidden style={{
            position: 'absolute',
            left: '50%', top: '45%',
            width: p.size, height: p.size,
            borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            animationName: 'sb-outcome-particle',
            animationDuration: `${0.8 + (i % 3) * 0.3}s`,
            animationTimingFunction: 'ease-out',
            animationDelay: p.delay,
            animationFillMode: 'forwards',
            // @ts-ignore CSS custom properties
            '--px': p.px,
            '--py': p.py,
          } as React.CSSProperties} />
        ))}

        {/* Main label */}
        <div
          className="sb-display"
          style={{
            fontSize: 'clamp(52px, 12vw, 96px)',
            fontWeight: 900,
            letterSpacing: '0.18em',
            lineHeight: 1,
            textAlign: 'center',
            color: isWin ? '#fde68a' : '#fca5a5',
            textShadow: isWin
              ? '0 0 40px #fbbf24, 0 0 80px #f59e0b88, 0 4px 0 rgba(0,0,0,0.7)'
              : '0 0 40px #ef4444, 0 0 80px #dc262688, 0 4px 0 rgba(0,0,0,0.7)',
            animation: 'sb-outcome-text-in 0.65s cubic-bezier(0.22,1,0.36,1) 0.05s both',
            willChange: 'transform, opacity, filter',
          }}
        >
          {isWin ? 'VICTORY' : 'DEFEATED'}
        </div>

        {/* Sub-label */}
        <div
          className="sb-mono"
          style={{
            marginTop: 18,
            fontSize: 'clamp(11px, 2.5vw, 16px)',
            letterSpacing: '0.35em',
            color: isWin ? 'rgba(253,230,138,0.75)' : 'rgba(252,165,165,0.6)',
            textAlign: 'center',
            animation: 'sb-outcome-sub-in 0.5s ease-out 0.6s both',
          }}
        >
          {isWin ? '✦  BATTLE CLEARED  ✦' : '✦  YOU HAVE FALLEN  ✦'}
        </div>

        {/* Pulse ring */}
        <div aria-hidden style={{
          position: 'absolute',
          left: '50%', top: '44%',
          width: 260, height: 260,
          borderRadius: '50%',
          border: `2px solid ${isWin ? 'rgba(251,191,36,0.35)' : 'rgba(220,38,38,0.35)'}`,
          transform: 'translate(-50%, -50%)',
          animation: 'sb-outcome-pulse 1.1s ease-in-out 0.3s infinite',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute',
          left: '50%', top: '44%',
          width: 380, height: 380,
          borderRadius: '50%',
          border: `1px solid ${isWin ? 'rgba(251,191,36,0.18)' : 'rgba(220,38,38,0.18)'}`,
          transform: 'translate(-50%, -50%)',
          animation: 'sb-outcome-pulse 1.4s ease-in-out 0.5s infinite',
          pointerEvents: 'none',
        }} />
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

        // ── Fireball: multi-layer fire orb with comet tail ──────────────────
        if (p.archetype === 'fireball') {
          const orbSize = 48;
          // Tail angle points opposite to travel direction.
          const tailAngle = angle + 180;
          const tailLen = 72;
          return (
            // Outer wrapper handles the travel animation (same css var trick).
            <div
              key={p.id}
              className="sb-projectile"
              style={{
                position: 'absolute',
                left: p.from.x - orbSize / 2,
                top: p.from.y - orbSize / 2,
                width: orbSize, height: orbSize,
                transformOrigin: '50% 50%',
                ['--proj-dx' as string]: `${dx}px`,
                ['--proj-dy' as string]: `${dy}px`,
                ['--proj-angle' as string]: '0deg', // no travel rotation — fire orb stays upright
                ['--proj-duration' as string]: `${p.durationMs}ms`,
                pointerEvents: 'none',
              } as React.CSSProperties}
            >
              {/* Comet tail — elongated gradient pointing opposite travel */}
              <div style={{
                position: 'absolute',
                left: '50%', top: '50%',
                width: tailLen, height: 22,
                transformOrigin: '0% 50%',
                transform: `translate(-4px, -11px) rotate(${tailAngle}deg)`,
                background: `linear-gradient(90deg, transparent 0%, #ff6a0044 15%, #ff8c0088 40%, #ffb30066 65%, transparent 100%)`,
                borderRadius: 99,
                filter: 'blur(4px)',
              }} />
              {/* Second narrower hot tail */}
              <div style={{
                position: 'absolute',
                left: '50%', top: '50%',
                width: tailLen * 0.55, height: 10,
                transformOrigin: '0% 50%',
                transform: `translate(-3px, -5px) rotate(${tailAngle}deg)`,
                background: `linear-gradient(90deg, transparent 0%, #fff5b888 20%, #ffcc0099 55%, transparent 100%)`,
                borderRadius: 99,
                filter: 'blur(2px)',
              }} />

              {/* Outer fire corona — wobbly, hot orange */}
              <div className="sb-fireball-wobble" style={{
                position: 'absolute', inset: -10,
                borderRadius: '50%',
                background: `radial-gradient(circle at 48% 48%,
                  transparent 28%,
                  #ff6a0055 45%,
                  #ff4500aa 62%,
                  #cc200066 80%,
                  transparent 100%)`,
                filter: 'blur(5px)',
              }} />

              {/* Mid flame layer — bright orange-yellow */}
              <div className="sb-fireball-wobble" style={{
                position: 'absolute', inset: -2,
                borderRadius: '50%',
                background: `radial-gradient(circle at 45% 45%,
                  #fffbe0 0%,
                  #ffe066 18%,
                  #ff8c00 42%,
                  #cc3300 68%,
                  transparent 88%)`,
                boxShadow: `0 0 28px #ff6a00cc, 0 0 56px #ff4500aa, 0 0 90px #ff200066`,
                animationDuration: '195ms', // faster wobble for inner layer
              }} />

              {/* White-hot core */}
              <div style={{
                position: 'absolute',
                left: '22%', top: '18%',
                width: '36%', height: '36%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, #ffffff 0%, #fff5b8 50%, transparent 80%)',
                filter: 'blur(2px)',
                opacity: 0.9,
              }} />
            </div>
          );
        }

        // ── All other archetypes ─────────────────────────────────────────────
        let w = 26, h = 26, radius = 13;
        let bg = `radial-gradient(circle, ${color} 0%, ${color}cc 40%, transparent 75%)`;
        let glow = `0 0 18px ${color}, 0 0 36px ${color}99`;
        let extraStyle: React.CSSProperties = {};
        switch (p.archetype) {
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
            break;
          case 'slash':
          case 'smash':
          default:
            w = 40; h = 5; radius = 2;
            bg = `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`;
            glow = `0 0 14px ${color}aa`;
            break;
        }
        if (p.archetype === 'beam') {
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

  // Fireball explosion layer — flash disc + rising flame licks + smoke puff.
  // Rendered between the impact rings and the generic particles so the smoke
  // sits on top of the rings but under the ember sparks.
  const FireballExplosionLayer = fireballExplosions.length > 0 && (
    <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 253 }}>
      {fireballExplosions.map(exp => {
        const s = exp.size;
        // Pre-seed 16 flame lick particles around the explosion center.
        const flameAngles = Array.from({ length: 16 }, (_, i) => {
          const spread = (i / 16) * Math.PI * 2;
          const dist = s * (0.28 + (i % 3) * 0.18);
          // Bias upward — flames rise.
          const biasY = -s * 0.22;
          return {
            px: Math.cos(spread) * dist,
            py: Math.sin(spread) * dist + biasY,
            rot: (spread * 180 / Math.PI) + 90,
            scale: 0.6 + (i % 4) * 0.25,
            dur: 700 + (i % 5) * 110,
            // Cycle through hot → orange → red colors.
            color: ['#fffbe0', '#ffe066', '#ff8c00', '#ff4500', '#cc2200'][i % 5],
            w: 10 + (i % 3) * 6,
            h: 18 + (i % 4) * 10,
          };
        });
        return (
          <div key={exp.id} style={{ position: 'absolute', left: exp.x, top: exp.y }}>
            {/* Instant white-orange flash disc */}
            <div className="sb-fireball-flash" style={{
              position: 'absolute',
              left: -s * 0.8, top: -s * 0.8,
              width: s * 1.6, height: s * 1.6,
              borderRadius: '50%',
              background: `radial-gradient(circle, #ffffff 0%, #fff5b8 18%, #ff8c00 40%, #ff3300 65%, transparent 85%)`,
              boxShadow: `0 0 ${s * 0.8}px #ff6a00cc, 0 0 ${s * 1.4}px #ff330088`,
              transform: 'translate(-50%, -50%)',
            }} />

            {/* Flame lick particles */}
            {flameAngles.map((f, fi) => (
              <div
                key={fi}
                className="sb-fireball-particle"
                style={{
                  position: 'absolute',
                  left: -f.w / 2, top: -f.h / 2,
                  width: f.w, height: f.h,
                  borderRadius: '50% 50% 30% 30% / 60% 60% 40% 40%',
                  background: `radial-gradient(ellipse at 50% 80%, ${f.color} 0%, ${f.color}bb 40%, transparent 80%)`,
                  boxShadow: `0 0 ${f.w * 1.5}px ${f.color}cc`,
                  filter: 'blur(1.5px)',
                  ['--px' as string]: `${f.px}px`,
                  ['--py' as string]: `${f.py}px`,
                  ['--prot' as string]: `${f.rot}deg`,
                  ['--pscale' as string]: String(f.scale),
                  ['--pdur' as string]: `${f.dur}ms`,
                } as React.CSSProperties}
              />
            ))}

            {/* Smoke puff */}
            <div className="sb-fireball-smoke" style={{
              position: 'absolute',
              left: 0, top: 0,
              width: s * 1.1, height: s * 0.9,
              borderRadius: '50%',
              background: `radial-gradient(circle, rgba(80,60,50,0.55) 0%, rgba(60,40,30,0.3) 50%, transparent 80%)`,
              filter: 'blur(8px)',
            }} />
          </div>
        );
      })}
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
            const baseAngle = (i / burst.count) * Math.PI * 2;
            const distance = 55 + (i % 5) * 18;
            const pDx = Math.cos(baseAngle) * distance;
            // Fireball embers fly upward-biased (gravity pulls down but heat
            // drives up — net upward bias for embers).
            const pDy = burst.archetype === 'fireball'
              ? Math.sin(baseAngle) * distance - 30
              : Math.sin(baseAngle) * distance;
            const size = burst.archetype === 'fireball' || burst.archetype === 'smash'
              ? 5 + (i % 4) * 3
              : burst.archetype === 'ice_shard'
                ? 4 + (i % 3) * 2
                : 3 + (i % 3) * 2;
            const isShard = burst.archetype === 'ice_shard';
            const isOrb = burst.archetype === 'arcane_orb';
            const isFireball = burst.archetype === 'fireball';
            // Fireball embers cycle through white-hot → orange → deep red.
            const fireColors = ['#fffbe0', '#ffe066', '#ff8c00', '#ff5500', '#cc2200'];
            const particleColor = isFireball ? fireColors[i % fireColors.length] : burst.color;
            return (
              <div
                key={i}
                className="sb-particle"
                style={{
                  position: 'absolute',
                  // Flame particles are elongated teardrop shapes.
                  width: isFireball ? size : (isShard ? size * 2 : size),
                  height: isFireball ? size * 1.8 : size,
                  background: isFireball
                    ? `radial-gradient(ellipse at 50% 30%, #ffffff 0%, ${particleColor} 40%, ${particleColor}88 70%, transparent 100%)`
                    : isOrb
                      ? `radial-gradient(circle, #ffffff 0%, ${particleColor} 50%, transparent 80%)`
                      : `radial-gradient(circle, ${particleColor} 0%, ${particleColor}cc 60%, transparent 90%)`,
                  borderRadius: isFireball ? '50% 50% 30% 30%' : (isShard ? '2px' : '50%'),
                  boxShadow: `0 0 ${isFireball ? 10 : 8}px ${particleColor}`,
                  filter: isFireball ? 'blur(0.8px)' : 'none',
                  ['--particle-dx' as string]: `${pDx}px`,
                  ['--particle-dy' as string]: `${pDy}px`,
                  ['--particle-rot' as string]: `${(i * 47) % 360}deg`,
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

  // SVG connector lines drawn between adjacent slots that share the same combo.
  // Rendered as an absolutely-positioned overlay behind the slot cards.
  function AdjacentComboConnectors({ slots, slotCardW, slotCardH, slotGap }: {
    slots: typeof runner.state.slots; slotCardW: number; slotCardH: number; slotGap: number;
  }) {
    const totalW = slots.length * slotCardW + (slots.length - 1) * slotGap;
    const connectors: JSX.Element[] = [];
    for (let i = 0; i < slots.length - 1; i++) {
      const j = i + 1;
      const leftHasCombo  = slots[i].bound && comboColorFor(i) !== null;
      const rightHasCombo = slots[j].bound && comboColorFor(j) !== null;
      const sameCombo = leftHasCombo && rightHasCombo && comboColorFor(i) === comboColorFor(j);
      if (!sameCombo) continue;
      const color = comboColorFor(i)!;
      const x1 = i * (slotCardW + slotGap) + slotCardW;
      const x2 = j * (slotCardW + slotGap);
      const y  = slotCardH / 2;
      connectors.push(
        <line key={`${i}-${j}`}
          x1={x1} y1={y} x2={x2} y2={y}
          stroke={color} strokeWidth={2} strokeDasharray="4 3"
          className="sb-connector-path"
          style={{ ['--slot-combo-color' as string]: color } as React.CSSProperties}
        />
      );
    }
    if (connectors.length === 0) return null;
    return (
      <svg
        width={totalW} height={slotCardH}
        style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }}
        aria-hidden
      >
        {connectors}
      </svg>
    );
  }

  // Inline combo preview banner shown below the slot row.
  // During active preview (before end-turn), shows which slots form a combo
  // and the expected total damage. During animation it's hidden.
  function ComboPreviewBanner({ compact }: { compact: boolean }) {
    if (animating) return null;
    // Collect active combos with their slot indices and totals.
    type ComboBand = { kind: 'onslaught' | 'triadic' | 'relentless'; slots: number[]; total: number; color: string; icon: string; label: string };
    const bands: ComboBand[] = [];
    if (comboPreview.onslaught.length > 0) {
      const total = comboPreview.onslaught.reduce((s, idx) => s + (slotDamagePreview[idx]?.effective ?? 0), 0);
      bands.push({ kind: 'onslaught', slots: comboPreview.onslaught, total, color: '#ff5757', icon: '⚔', label: 'ONSLAUGHT' });
    }
    if (comboPreview.relentless.length > 0) {
      const total = comboPreview.relentless.reduce((s, idx) => s + (slotDamagePreview[idx]?.effective ?? 0), 0);
      bands.push({ kind: 'relentless', slots: comboPreview.relentless, total, color: '#c084fc', icon: '◈', label: 'RELENTLESS' });
    }
    if (comboPreview.triadic.length > 0) {
      const total = comboPreview.triadic.reduce((s, idx) => s + (slotDamagePreview[idx]?.effective ?? 0), 0);
      bands.push({ kind: 'triadic', slots: comboPreview.triadic, total, color: '#7ec4ff', icon: '✦', label: 'TRIADIC' });
    }
    if (bands.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {bands.map(b => (
          <div key={b.kind} style={{
            display: 'flex', alignItems: 'center', gap: compact ? 5 : 8,
            padding: compact ? '3px 10px' : '4px 14px',
            background: `${b.color}18`,
            border: `1px solid ${b.color}`,
            borderRadius: 4,
            boxShadow: `0 0 10px ${b.color}40`,
          }}>
            <span style={{
              fontFamily: 'var(--sb-font-display)',
              fontSize: compact ? 9 : 11,
              fontWeight: 700,
              color: b.color,
              letterSpacing: '0.18em',
              textShadow: `0 0 8px ${b.color}`,
            }}>
              {b.icon} {b.label}
            </span>
            <span style={{
              fontFamily: 'var(--sb-font-mono)',
              fontSize: compact ? 8 : 9,
              color: 'rgba(255,235,180,0.5)',
              letterSpacing: '0.06em',
            }}>
              SLOTS {b.slots.map(s => s + 1).join(' + ')}
            </span>
            <span style={{
              fontFamily: 'var(--sb-font-mono)',
              fontSize: compact ? 10 : 12,
              fontWeight: 800,
              color: b.color,
              letterSpacing: '0.04em',
              textShadow: `0 0 6px ${b.color}80`,
            }}>
              ⚔{b.total}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Triggered combo flash — fires when END TURN resolves a combo.
  // Shows which slots participated and the combo name.
  const comboFlashSlots = comboFlash === 'onslaught' ? comboPreview.onslaught
                        : comboFlash === 'relentless' ? comboPreview.relentless
                        : comboFlash === 'triadic'    ? comboPreview.triadic
                        : [];
  const comboFlashSlotLabel = comboFlashSlots.length > 0
    ? ` · SLOTS ${comboFlashSlots.map(s => s + 1).join(' + ')}`
    : '';

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
        textShadow: '0 2px 4px rgba(0,0,0,0.85)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(253,230,138,0.5)',
      }}
    >
      <div style={{ fontSize: isMobile ? 18 : 26, fontWeight: 700, letterSpacing: '0.18em' }}>
        {comboFlash === 'onslaught' && '⚔  ONSLAUGHT  ⚔'}
        {comboFlash === 'triadic'    && '✦  TRIADIC STRIKE  ✦'}
        {comboFlash === 'relentless' && '◈  RELENTLESS  ◈'}
      </div>
      {comboFlashSlotLabel && (
        <div style={{
          fontSize: isMobile ? 9 : 11, fontWeight: 600, letterSpacing: '0.2em',
          marginTop: 4, opacity: 0.75,
          fontFamily: 'var(--sb-font-mono)',
        }}>
          {comboFlashSlotLabel}
        </div>
      )}
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
    const spacing = total >= 6 ? 40 : total >= 5 ? 48 : 56;

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

    // Hand area height: cards are `cardH` tall, drawn from bottom:18 inside
    // the container. Add 24px top breathing room so lifted cards don't clip.
    const handAreaHeight = cardH + 42;

    return (
      <div
        className={`relative w-full h-full overflow-hidden flex flex-col safe-top safe-bottom ${screenShake === 'heavy' ? 'sb-shake-heavy' : screenShake === 'light' ? 'sb-shake-light' : ''}`}
        style={containerStyle}
      >
        {Background}
        {SigilBorder({ position: 'top' })}
        {SigilBorder({ position: 'bottom' })}

        {/* ── TOP BAR: flee · stage title · turn · resources ── */}
        <div className="relative z-10 flex-shrink-0 px-2 pt-3 pb-1 flex flex-col gap-1">
          {/* Row 1: flee button + stage title + HC badge */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setConfirmDialog('exit')}
              className="sb-chip flex-shrink-0"
              style={{ cursor: 'pointer', padding: '6px 10px', fontSize: '12px', minWidth: 44, minHeight: 36 }}
            >
              ←
            </button>
            <div className="sb-display flex-1 min-w-0 text-center" style={{
              fontSize: '11px', padding: '6px 8px',
              background: 'linear-gradient(180deg, #3a2a1c 0%, #1a120a 50%, #3a2a1c 100%)',
              border: '2px solid var(--sb-bronze)',
              color: 'var(--sb-gold-light)',
              letterSpacing: '0.12em', textShadow: '0 1px 2px rgba(0,0,0,0.7)',
              boxShadow: 'inset 0 1px 0 rgba(255,235,180,0.3), 0 2px 6px rgba(0,0,0,0.5)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              borderRadius: 4,
            }}>
              ⚔ {stage.title.toUpperCase()} · T{runner.state.turn}
            </div>
            {hardcore && (
              <span className="sb-display sb-pulse-crimson flex-shrink-0" style={{
                fontSize: '9px', padding: '6px 8px',
                background: 'linear-gradient(180deg, #b91c1c 0%, #5b0e0e 100%)',
                border: '1.5px solid var(--sb-gold)', color: 'var(--sb-gold-light)',
                letterSpacing: '0.18em', borderRadius: 4,
              }}>HC</span>
            )}
          </div>
          {/* Row 2: resource chips — stamina / deck / discard */}
          <div className="flex items-center justify-end gap-1.5">
            <span className="sb-chip sb-chip-gold" style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }}>
              ⚡ {runner.state.staminaThisTurn}
            </span>
            <span className="sb-chip" style={{ fontSize: 10, padding: '3px 8px', flexShrink: 0 }}>
              🃏 {runner.state.deck.length}
            </span>
            <span className="sb-chip" style={{ fontSize: 10, padding: '3px 8px', opacity: 0.75, flexShrink: 0 }}>
              🗑 {runner.state.discard.length}
            </span>
          </div>
        </div>

        {/* ── ENEMY ROW — clipped to row, adaptive card sizing ── */}
        <div
          className="relative z-10 flex-shrink-0 flex justify-center items-end px-2 py-1"
          style={{ gap: `${Math.max(enemyGap, 4)}px`, overflow: 'hidden' }}
        >
          {runner.state.enemies.map(e => {
            const isBossEnemy = getEnemy(e.defId)?.archetype === 'boss';
            const w = isBossEnemy ? Math.round(enemyCardW * 1.45) : enemyCardW;
            const h = isBossEnemy ? Math.round(enemyCardH * 1.45) : enemyCardH;
            return EnemyCard({ e, cardW: w, cardH: h, isBossEnemy });
          })}
        </div>

        {/* ── SIGIL SLOTS — centered vertically in remaining space ── */}
        {(() => {
          const slotCardW = runner.state.slots.length >= 5 ? 62 : 72;
          const slotCardH = Math.round(slotCardW * 1.5);
          const slotGap = 6;
          return (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-2 py-2 min-h-0" style={{ gap: 4 }}>
              {/* Slot row with SVG connector overlay */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: slotGap }}>
                {AdjacentComboConnectors({ slots: runner.state.slots, slotCardW, slotCardH, slotGap })}
                {runner.state.slots.map((slot, slotIdx) => SigilSlot({ slot, slotIdx, cardW: slotCardW, cardH: slotCardH }))}
              </div>
              {/* Combo preview banner */}
              {ComboPreviewBanner({ compact: true })}
            </div>
          );
        })()}

        {/* ── TACTICS TOGGLE — above hand, left-aligned ── */}
        {tacticsInHand.length > 0 && (
          <div className="relative z-10 flex-shrink-0 px-2 pb-1">
            <button
              onClick={() => setTacticsOpen(o => !o)}
              className="sb-chip"
              style={{
                padding: '6px 14px', fontSize: 11, minHeight: 34,
                background: tacticsOpen ? 'var(--sb-leather)' : undefined,
                color: tacticsOpen ? 'var(--sb-gold-light)' : undefined,
              }}
            >
              ✦ TACTICS ({tacticsInHand.length})
            </button>
          </div>
        )}

        {/* ── HAND FAN ── */}
        <div className="relative flex-shrink-0 flex justify-center items-end" style={{
          height: handAreaHeight, pointerEvents: 'none', overflow: 'visible',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
            {actionsInHand.map(({ def, realIndex }, i) =>
              ActionCard({
                def, realIndex, i, total: actionsInHand.length,
                cardW, cardH,
                fan: { spacing, arcMul: 0.8, rotMax: 4 },
              }))}
          </div>
        </div>

        {/* ── BOTTOM ACTION BAR: END TURN + AUTO + player bar ── */}
        <div
          className="relative z-20 flex-shrink-0 px-2 pt-1.5 pb-4 flex flex-col gap-1.5"
          style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(10,7,4,0.88) 40%)' }}
        >
          <div style={{ display: 'flex', gap: 6 }}>
            {/* AUTO BATTLE button */}
            <button
              onClick={() => handleAutoBattle()}
              disabled={animating || isDealing}
              style={{
                flexShrink: 0,
                width: 64,
                height: 52,
                background: (animating || isDealing)
                  ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
                  : 'linear-gradient(180deg, #1e3a5f 0%, #0f1e33 100%)',
                border: '2.5px solid #7ec4ff',
                borderRadius: 6,
                color: (animating || isDealing) ? '#4a6a8a' : '#7ec4ff',
                fontFamily: 'var(--sb-font-display)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: (animating || isDealing) ? 'wait' : 'pointer',
                textShadow: (animating || isDealing) ? 'none' : '0 0 8px #7ec4ff80',
                boxShadow: (animating || isDealing)
                  ? 'none'
                  : 'inset 0 1px 0 rgba(126,196,255,0.3), 0 0 12px rgba(126,196,255,0.2)',
                opacity: (animating || isDealing) ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>⚡</span>
              <span>AUTO</span>
            </button>

            {/* END TURN button */}
            <button
              onClick={() => handleEndTurn()}
              disabled={animating || isDealing}
              style={{
                flex: 1,
                height: 52,
                background: (animating || isDealing)
                  ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
                  : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
                border: '2.5px solid var(--sb-gold)',
                borderRadius: 6,
                color: (animating || isDealing) ? '#8b6238' : 'var(--sb-gold-light)',
                fontFamily: 'var(--sb-font-display)',
                fontSize: 16, fontWeight: 700, letterSpacing: '0.14em',
                cursor: (animating || isDealing) ? 'wait' : 'pointer',
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                boxShadow: (animating || isDealing)
                  ? 'none'
                  : 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.5)',
                opacity: (animating || isDealing) ? 0.7 : 1,
                flexShrink: 0,
              }}
            >
              {animating ? '⚔ RESOLVING…' : isDealing ? '✦ DEALING…' : '▶ END TURN'}
            </button>
          </div>

          {/* Player HP bar — compact, full-width */}
          {PlayerBar({ compact: true })}
        </div>

        {/* ── TACTICS DRAWER — slides up from bottom bar ── */}
        {tacticsOpen && tacticsInHand.length > 0 && (
          <>
            <div
              onClick={() => setTacticsOpen(false)}
              className="absolute inset-0 z-30"
              style={{ background: 'rgba(0,0,0,0.55)' }}
            />
            <div className="absolute left-2 right-2 z-40 sb-fade-up" style={{
              bottom: 'calc(52px + 54px + 12px)', // clears END TURN + player bar + gap
              background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
              border: '2px solid var(--sb-bronze)',
              borderRadius: 6,
              padding: 10,
              maxHeight: '42vh',
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
                    fontSize: 18, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                  }}
                  aria-label="Close tactics"
                >×</button>
              </div>
              <div className="flex flex-col gap-1.5">
                {tacticsInHand.map(({ def, realIndex }) => TacticButton({ def, realIndex }))}
              </div>
            </div>
          </>
        )}

        {ChargeAuraLayer}
        {ComboFlashLayer}
        {FlyingCardOverlay}
        {DealCardOverlay}
        {ProjectileLayer}
        {ImpactRingLayer}
        {FireballExplosionLayer}
        {SlashLayer}
        {ParticleLayer}
        {FloaterLayer}
        {InfoModal}
        {OutcomeAnnounceLayer}
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
      <div className="sb-sigil-border sb-sigil-border-top" aria-hidden />
      <div className="sb-sigil-border sb-sigil-border-bottom" aria-hidden />

      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
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
        className="absolute top-4 left-2 z-20 sb-chip"
        style={{ cursor: 'pointer', padding: '5px 11px', fontSize: '11px' }}
      >
        ← FLEE
      </button>

      <div className="absolute top-4 right-2 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
        <span className="sb-chip sb-chip-gold" style={{ fontSize: '12px' }}>⚡ {runner.state.staminaThisTurn} STAMINA</span>
        <span className="sb-chip">🃏 {runner.state.deck.length} DECK</span>
        <span className="sb-chip" style={{ opacity: 0.75 }}>🗑 {runner.state.discard.length} DISCARD</span>
      </div>

      {/* Enemy row — boss appears larger and centered, flanked by minions. */}
      <div className="absolute z-10 left-0 right-0 flex justify-center items-end gap-3 px-4" style={{ top: 56 }}>
        {runner.state.enemies.map(e => {
          const isBossEnemy = getEnemy(e.defId)?.archetype === 'boss';
          const w = isBossEnemy ? 270 : 194;
          const h = isBossEnemy ? 378 : 270;
          return EnemyCard({ e, cardW: w, cardH: h, isBossEnemy });
        })}
      </div>

      {/* Sigil slots — pulled toward vertical middle */}
      <div className="absolute z-10 left-0 right-0 flex flex-col items-center gap-3" style={{
        top: '50%', transform: 'translateY(-25%)',
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 16 }}>
          {AdjacentComboConnectors({ slots: runner.state.slots, slotCardW: 92, slotCardH: 128, slotGap: 16 })}
          {runner.state.slots.map((slot, slotIdx) => SigilSlot({ slot, slotIdx, cardW: 92, cardH: 128 }))}
        </div>
        {ComboPreviewBanner({ compact: false })}
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

      {/* END TURN + AUTO BATTLE button row */}
      <div className="absolute z-20" style={{
        left: '50%', bottom: 108,
        transform: 'translateX(-50%)',
        display: 'flex', gap: 8,
      }}>
        {/* AUTO BATTLE */}
        <button
          onClick={() => handleAutoBattle()}
          disabled={animating || isDealing}
          style={{
            width: 72, height: 52,
            background: (animating || isDealing)
              ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
              : 'linear-gradient(180deg, #1e3a5f 0%, #0f1e33 100%)',
            border: '2.5px solid #7ec4ff',
            borderRadius: 4,
            color: (animating || isDealing) ? '#4a6a8a' : '#7ec4ff',
            fontFamily: 'var(--sb-font-display)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            cursor: (animating || isDealing) ? 'wait' : 'pointer',
            textShadow: (animating || isDealing) ? 'none' : '0 0 8px #7ec4ff80',
            boxShadow: (animating || isDealing)
              ? 'none'
              : 'inset 0 1px 0 rgba(126,196,255,0.3), 0 0 16px rgba(126,196,255,0.15)',
            opacity: (animating || isDealing) ? 0.5 : 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 3,
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>⚡</span>
          <span>AUTO</span>
        </button>

        {/* END TURN */}
        <button
          onClick={() => handleEndTurn()}
          disabled={animating || isDealing}
          style={{
            width: 220, height: 52,
            background: (animating || isDealing)
              ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
              : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
            border: '2.5px solid var(--sb-gold)',
            borderRadius: 4,
            color: (animating || isDealing) ? '#8b6238' : 'var(--sb-gold-light)',
            fontFamily: 'var(--sb-font-display)',
            fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
            cursor: (animating || isDealing) ? 'wait' : 'pointer',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.6)',
            opacity: (animating || isDealing) ? 0.7 : 1,
          }}
        >
          {animating ? '⚔ RESOLVING…' : isDealing ? '✦ DEALING…' : '▶ END TURN'}
        </button>
      </div>

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
        left: '50%', bottom: 22,
        transform: 'translateX(-50%)',
        width: 'min(560px, calc(100% - 200px))',
      }}>
        {PlayerBar({ compact: false })}
      </div>

      {ChargeAuraLayer}
      {ComboFlashLayer}
      {FlyingCardOverlay}
      {DealCardOverlay}
      {ProjectileLayer}
      {ImpactRingLayer}
      {FireballExplosionLayer}
      {SlashLayer}
      {ParticleLayer}
      {FloaterLayer}
      {InfoModal}
      {OutcomeAnnounceLayer}
      {ConfirmDialogLayer}
    </div>
  );
}

