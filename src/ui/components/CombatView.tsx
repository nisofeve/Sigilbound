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
  elementChainMultiplier,
  computeElementChains,
  getBattleIntro,
} from '@engine/index';
import type { DamageType } from '../../engine/damage';
import { elementalHitLabel } from '../../engine/damage';
import { sfx } from '@game/sfx';
import { getEnemy } from '../../engine/bestiary';
import { EnemyCard as EnemyCardDisplay } from './EnemyCard';
import { ActionCard as ActionCardDisplay, TacticCard as TacticCardDisplay } from './CombatCard';
import { BattleCardDetail } from './CardDetailBody';
import { RARITY_COLOR } from './GameCard';
import { IMAGE_MANIFEST } from './imageManifest';

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

function cardImageUrl(cardId: string, cardName: string): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ids = [cardId, norm(cardName), cardId.replace(/\./g, '-'), cardId.replace(/\./g, '_')];
  for (const id of ids) {
    const hit = IMAGE_MANIFEST[`cards/${id}`];
    if (hit) return hit;
  }
  return null;
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

  type ComboFlashInfo = { type: DamageType; chainLength: number; slotIndices: number[] };
  // Queue so multiple chains in one turn each get their own display window.
  const [comboQueue, setComboQueue] = useState<ComboFlashInfo[]>([]);
  const comboFlash = comboQueue[0] ?? null;
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerCombo = (info: ComboFlashInfo) => {
    setComboQueue(q => {
      const next = [...q, info];
      // If nothing is currently showing, start the drain timer immediately.
      if (q.length === 0) {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(function drain() {
          setComboQueue(prev => {
            const remaining = prev.slice(1);
            if (remaining.length > 0) {
              flashTimerRef.current = setTimeout(drain, 1800);
            } else {
              flashTimerRef.current = null;
            }
            return remaining;
          });
        }, 1800);
      }
      return next;
    });
  };

  const [draggingHandIdx, setDraggingHandIdx] = useState<number | null>(null);
  const [hoverSlotIdx, setHoverSlotIdx] = useState<number | null>(null);
  const [selectedHandIdx, setSelectedHandIdx] = useState<number | null>(null);
  const [hoveredHandIdx, setHoveredHandIdx] = useState<number | null>(null);
  // Popup shown when a hand card is selected — card detail overlay.
  // Gated by cardInfoEnabled; persisted to localStorage so the preference
  // survives across battles without threading it through props.
  type HandPopup = { card: NonNullable<ReturnType<typeof getAction>> | NonNullable<ReturnType<typeof getTactic>>; rect: DOMRect };
  const [handCardPopup, setHandCardPopup] = useState<HandPopup | null>(null);
  const [cardInfoEnabled, setCardInfoEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('sb_card_info') !== 'off'; } catch { return true; }
  });
  function toggleCardInfo() {
    setCardInfoEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('sb_card_info', next ? 'on' : 'off'); } catch { /* ignore */ }
      if (!next) setHandCardPopup(null);
      return next;
    });
  }
  // Discard-pick mode: set of hand indices the player has selected to discard.
  const [discardPickSelected, setDiscardPickSelected] = useState<Set<number>>(new Set());

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

  // ── Battle intro overlay state ──
  // Phase sequence: 'text' → player taps → 'done' (overlay gone, deal + drop begin).
  type IntroPhase = 'text' | 'done';
  const [introPhase, setIntroPhase] = useState<IntroPhase>('text');
  // Which enemies have landed (indices into runner.state.enemies).
  const [droppedEnemies, setDroppedEnemies] = useState<Set<number>>(new Set());
  // Whether the intro shake class is applied to the playfield.
  const [introShaking, setIntroShaking] = useState(false);
  const introShakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const introFiredRef = useRef(false);

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

  function tacticEffectLabel(def: NonNullable<ReturnType<typeof getTactic>>): string {
    const e = def.effect;
    switch (e.kind) {
      case 'block':                      return `+${e.amount} BLOCK`;
      case 'heal':                       return `HEAL ${e.amount} HP`;
      case 'draw':                       return `DRAW ${e.cards} CARD${e.cards !== 1 ? 'S' : ''}`;
      case 'gain_stamina':               return `+${e.amount} STAMINA`;
      case 'damage_buff':                return `+${Math.round(e.pct * 100)}% DAMAGE`;
      case 'enemy_damage_debuff':        return `−${Math.round(e.pct * 100)}% ENEMY DMG`;
      case 'apply_status_self':          return `APPLY ${e.id.toUpperCase()} ×${e.stacks}`;
      case 'apply_status_all_enemies':   return `INFLICT ${e.id.toUpperCase()} ALL`;
      case 'sigil_advance':              return `ADVANCE SIGIL +${e.amount}`;
      case 'sigil_clear_redraw':         return 'CLEAR SIGILS · REDRAW';
      case 'extra_sigil_temp':           return `+1 SIGIL (${e.turns} TURNS)`;
      case 'duplicate_top_discard_action': return 'ECHO TOP DISCARD';
      case 'instant_resolve_one_sigil':  return 'INSTANT RESOLVE';
      case 'reveal_intents_all':         return 'REVEAL ALL INTENTS';
      case 'tutor_pick_one':             return 'TACTICAL PREP';
      case 'extra_turn':                 return 'EXTRA TURN!';
      case 'reflect_next_attack':        return `REFLECT ${Math.round(e.pct * 100)}% DMG`;
      case 'all_cards_buffed_zero_cost': return 'ZERO-COST HAND';
      case 'discard_draw':               return `DISCARD ${e.discard} · DRAW ${e.draw}`;
      default:                           return def.description.toUpperCase();
    }
  }

  async function handlePlayTactic(realHandIndex: number): Promise<void> {
    if (isDealing || animating || tacticPlay !== null) return;
    if (runner.state.pendingDiscardCount > 0) return;

    const cardId = runner.state.hand[realHandIndex];
    const def = getTactic(cardId ?? '');
    if (!def) return;

    // Check affordability before committing to animation.
    const effectiveCost = Math.max(0, def.cost - runner.state.upgradeBuffs.tacticStaminaDiscount);
    if (runner.state.staminaThisTurn < effectiveCost) return;

    // Measure source card DOM rect.
    const cardEl = cardRefs.current.get(realHandIndex);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = cardEl?.offsetWidth  ?? 82;
    const cardH = cardEl?.offsetHeight ?? 115;
    const cardRect = cardEl?.getBoundingClientRect();
    const from = cardRect
      ? { x: cardRect.left, y: cardRect.top }
      : { x: vw / 2 - cardW / 2, y: vh - cardH - 80 };
    const accentColor = RARITY_COLOR[def.rarity] ?? RARITY_COLOR.common;
    const announceText = tacticEffectLabel(def);

    // ── Phase 1: fly to screen centre ──────────────────────────────────────
    setDrawingCards(prev => { const n = new Set(prev); n.add(realHandIndex); return n; });
    setTacticPlay({ def, phase: 'flying', cardW, cardH, from, announceText, accentColor, hiddenHandIdx: realHandIndex });

    const centreTo = { x: vw / 2 - cardW / 2, y: vh / 2 - cardH / 2 };
    await new Promise<void>(resolve => {
      const duration  = 320;
      const startTime = performance.now();
      const easeOut   = (t: number) => 1 - Math.pow(1 - t, 3);
      const tick = (now: number) => {
        const t     = Math.min(1, (now - startTime) / duration);
        const e     = easeOut(t);
        const dx    = from.x + (centreTo.x - from.x) * e;
        const dy    = from.y + (centreTo.y - from.y) * e;
        const travel = Math.hypot(centreTo.x - from.x, centreTo.y - from.y);
        const arcOff = Math.sin(e * Math.PI) * Math.min(100, travel * 0.3);
        const dirSign = Math.sign(centreTo.x - from.x) || -1;
        const rot   = (1 - e) * 12 * dirSign;
        const sc    = e < 0.5 ? 1 + 0.1 * (e / 0.5) : 1.1 + (1 - 1.1) * ((e - 0.5) / 0.5);
        const el = tacticPlayOverlayRef.current;
        if (el) {
          el.style.transform = `translate3d(${dx}px, ${dy - arcOff}px, 0) rotate(${rot}deg) scale(${sc})`;
          el.style.opacity   = '1';
        }
        if (t < 1) {
          tacticPlayFrameRef.current = requestAnimationFrame(tick);
        } else {
          tacticPlayFrameRef.current = null;
          resolve();
        }
      };
      tacticPlayFrameRef.current = requestAnimationFrame(tick);
    });

    // ── Phase 2: pulse + shatter ───────────────────────────────────────────
    setTacticPlay(prev => prev ? { ...prev, phase: 'shattering' } : prev);
    sfx.tacticShatter();
    await new Promise<void>(r => setTimeout(r, 520));

    // ── Execute engine effect NOW (card is already "gone" visually) ─────────
    const handBefore = [...runner.state.hand];
    runner.playTactic(realHandIndex);
    const handAfter = runner.state.hand;
    const drawnIndices: number[] = [];
    for (let i = 0; i < handAfter.length; i++) {
      if (handBefore[i] !== handAfter[i]) drawnIndices.push(i);
    }
    if (drawnIndices.length > 0) {
      setDrawingCards(prev => { const n = new Set(prev); for (const idx of drawnIndices) n.add(idx); return n; });
    }
    repaint();

    // ── Phase 3: effect announcement ──────────────────────────────────────
    setTacticPlay(prev => prev ? { ...prev, phase: 'announcing' } : prev);
    sfx.tacticAnnounce();
    await new Promise<void>(r => setTimeout(r, 900));

    // Tear down.
    setTacticPlay(null);
    setDrawingCards(prev => { const n = new Set(prev); n.delete(realHandIndex); return n; });

    if (drawnIndices.length > 0) {
      await dealNewCards(drawnIndices);
    }
  }

  function handleConfirmDiscard(): void {
    const needed = runner.state.pendingDiscardCount;
    if (discardPickSelected.size !== needed) return;
    const indices = Array.from(discardPickSelected);
    const handBefore = [...runner.state.hand];
    if (runner.resolveDiscard(indices)) {
      setDiscardPickSelected(new Set());
      // Find cards drawn by pendingDiscardDrawCount (discard_draw tactics).
      const handAfter = runner.state.hand;
      const drawnIndices: number[] = [];
      for (let i = 0; i < handAfter.length; i++) {
        if (handBefore[i] !== handAfter[i]) drawnIndices.push(i);
      }
      if (drawnIndices.length > 0) {
        setDrawingCards(prev => {
          const next = new Set(prev);
          for (const idx of drawnIndices) next.add(idx);
          return next;
        });
        repaint();
        void dealNewCards(drawnIndices);
      } else {
        repaint();
      }
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
        // ev.combo is always 'element_chain' now
        triggerCombo({ type: ev.damageType, chainLength: ev.chainLength, slotIndices: ev.slotIndices });
        sfx.comboOnslaught();
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
    if (runner.state.pendingDiscardCount > 0) return;
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
    for (const chain of preview.chains) {
      const col = elementTypeColor(chain.type);
      for (const idx of chain.indices) comboSlotMap.set(idx, col);
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
      setHandCardPopup(null);
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

  function handleCardClick(realHandIndex: number, cardEl?: HTMLDivElement | null): void {
    if (isDealing || animating) return;
    if (runner.state.pendingDiscardCount > 0) {
      // In discard-picking mode — handled by the overlay, ignore normal clicks.
      return;
    }

    const cardId = runner.state.hand[realHandIndex] ?? '';
    // Tactic cards: first click shows info + confirm popup; second click plays.
    const tacticDef = getTactic(cardId);
    if (tacticDef) {
      setSelectedHandIdx(prev => {
        if (prev !== realHandIndex) {
          // First click — show card detail popup with PLAY button.
          const rect = cardEl?.getBoundingClientRect() ?? null;
          if (rect && cardInfoEnabled) {
            setHandCardPopup({ card: tacticDef, rect });
          }
          return realHandIndex;
        }
        // Second click on same tactic — play it directly.
        setHandCardPopup(null);
        setTimeout(() => handlePlayTactic(realHandIndex), 0);
        return null;
      });
      return;
    }

    setSelectedHandIdx(prev => {
      if (prev !== realHandIndex) {
        // First click — select the card and show detail popup.
        const rect = cardEl?.getBoundingClientRect() ?? null;
        const cardDef = getAction(cardId);
        if (cardDef && rect && cardInfoEnabled) {
          setHandCardPopup({ card: cardDef, rect });
        }
        return realHandIndex;
      }
      // Second click on the same card — dismiss popup + auto-bind to leftmost empty slot.
      setHandCardPopup(null);
      const emptySlotIdx = runner.state.slots.findIndex(s => !s.bound);
      if (emptySlotIdx >= 0) {
        setTimeout(() => handleBindToSlot(realHandIndex, emptySlotIdx), 0);
      }
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
      // Score using element chain multipliers for this slot arrangement.
      // pairs is ordered by slot index; build a slot-type map for chain calc.
      const maxSlot = Math.max(...pairs.map(p => p.slotIdx), state.slots.length - 1);
      const slotTypeArr: Array<DamageType | null> = Array(maxSlot + 1).fill(null);
      // Include already-bound slots that will resolve this turn.
      for (let si = 0; si < state.slots.length; si++) {
        const sb = state.slots[si]?.bound;
        if (sb && sb.charge <= 1) slotTypeArr[si] = sb.damageType as DamageType;
      }
      for (const { handIdx, slotIdx } of pairs) {
        const cardId = state.hand[handIdx] ?? '';
        const d = getAction(cardId);
        if (d && d.charge <= 0) slotTypeArr[slotIdx] = d.damageType as DamageType;
      }
      const chains = computeElementChains(slotTypeArr);
      const chainMultMap = new Map<number, number>();
      for (const ch of chains) {
        const m = elementChainMultiplier(ch.indices.length);
        for (const idx of ch.indices) chainMultMap.set(idx, m);
      }
      let total = 0;
      for (const { handIdx, slotIdx } of pairs) {
        const cardId = state.hand[handIdx] ?? '';
        const d = getAction(cardId);
        if (!d) continue;
        if (d.charge > 0) { total += d.damage * 0.15; continue; }
        const chainMult = chainMultMap.get(slotIdx) ?? 1;
        total += Math.round(d.damage * (d.hits ?? 1) * chainMult);
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

  // Unified hand — all cards (actions + tactics) in the order they sit in hand[].
  type HandEntry =
    | { kind: 'action'; def: NonNullable<ReturnType<typeof getAction>>; realIndex: number }
    | { kind: 'tactic'; def: NonNullable<ReturnType<typeof getTactic>>; realIndex: number };
  const allCardsInHand: HandEntry[] = runner.state.hand.map((id, i) => {
    const act = getAction(id);
    if (act) return { kind: 'action' as const, def: act, realIndex: i };
    const tac = getTactic(id);
    if (tac) return { kind: 'tactic' as const, def: tac, realIndex: i };
    return null;
  }).filter((x): x is HandEntry => x !== null);

  const pendingDiscard = runner.state.pendingDiscardCount > 0;

  // Combo preview — element chains for the current slot arrangement.
  const comboPreview = animating
    ? { chains: [] as Array<{ type: DamageType; indices: number[]; multiplier: number }> }
    : runner.previewCombosForEndTurn();

  // slot index → chain multiplier (1.0 if not in any chain)
  const chainMultiMap = new Map<number, number>();
  // slot index → element type for color (undefined if no chain)
  const chainTypeMap = new Map<number, DamageType>();
  for (const chain of comboPreview.chains) {
    for (const idx of chain.indices) {
      chainMultiMap.set(idx, chain.multiplier);
      chainTypeMap.set(idx, chain.type);
    }
  }

  // Per-slot damage preview — element chain multiplier applied.
  type SlotDmgInfo = { base: number; effective: number; willResolve: boolean; chainMult: number } | null;
  const slotDamagePreview: SlotDmgInfo[] = (() => {
    if (animating) return runner.state.slots.map(() => null);
    const slots = runner.state.slots;
    return slots.map((slot, idx) => {
      if (!slot.bound) return null;
      const hits = slot.bound.hits ?? 1;
      const base = slot.bound.damage * hits;
      const willResolve = slot.bound.charge <= 1;
      if (!willResolve) return { base, effective: base, willResolve: false, chainMult: 1 };
      const chainMult = chainMultiMap.get(idx) ?? 1;
      const effective = Math.round(base * chainMult);
      return { base, effective, willResolve: true, chainMult };
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

  // ── Tactic play animation ─────────────────────────────────────────────────
  // Three-phase overlay: 1) card flies to screen centre, 2) pulse + shatter
  // particles, 3) effect announcement banner. The engine effect executes
  // AFTER the announce so the player reads it before seeing the outcome.
  type TacticPlayPhase = 'flying' | 'shattering' | 'announcing';
  const [tacticPlay, setTacticPlay] = useState<null | {
    def: NonNullable<ReturnType<typeof getTactic>>;
    phase: TacticPlayPhase;
    // card position during flight (rAF-driven, same as FlyingCardOverlay)
    cardW: number; cardH: number;
    from: { x: number; y: number };
    announceText: string;
    accentColor: string;
    // hidden hand index so the source card disappears during the animation
    hiddenHandIdx: number;
  }>(null);
  const tacticPlayOverlayRef = useRef<HTMLDivElement | null>(null);
  const tacticPlayFrameRef   = useRef<number | null>(null);
  useEffect(() => {
    return () => { if (tacticPlayFrameRef.current) cancelAnimationFrame(tacticPlayFrameRef.current); };
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

      const duration = 220;
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
        await new Promise<void>(r => setTimeout(r, 35));
      }
    }

    setIsDealing(false);
  }

  // ── Enemy drop-in sequence ────────────────────────────────────────────────
  // Called when the player taps "TAP TO ENTER". Immediately dismisses the
  // intro overlay, fires the opening card deal, then stagger-drops each enemy
  // card into its real position in the battle layout.
  function startEnemyDropIn() {
    // Close the overlay right away so the battle screen is visible.
    setIntroPhase('done');

    // Kick off the opening deal immediately.
    if (!openingDealFiredRef.current) {
      openingDealFiredRef.current = true;
      const indices: number[] = [];
      for (let i = 0; i < runner.state.hand.length; i++) indices.push(i);
      setTimeout(() => { void dealNewCards(indices); }, 150);
    }

    // Drop each enemy into the battle layout, staggered. One rAF delay so
    // the battle layout has been painted before we read enemy DOM rects.
    const enemies = runner.state.enemies;
    requestAnimationFrame(() => {
      enemies.forEach((_, i) => {
        setTimeout(() => {
          setDroppedEnemies(prev => new Set([...prev, i]));
          sfx.enemyKill();
          // Enemy card shakes strongly after drop starts.
          setTimeout(() => {
            const enemyEl = enemyRefs.current.get(enemies[i]?.id ?? '');
            if (enemyEl) {
              enemyEl.classList.add('sb-enemy-land-shake');
              setTimeout(() => enemyEl.classList.remove('sb-enemy-land-shake'), 700);
            }
            if (introShakeTimerRef.current) clearTimeout(introShakeTimerRef.current);
            setIntroShaking(true);
            introShakeTimerRef.current = setTimeout(() => setIntroShaking(false), 560);
          }, 80);
        }, i * 220);
      });
    });
  }

  // Opening deal — fires once via startEnemyDropIn. This effect handles the
  // hot-reload edge case where introPhase is already 'done' on mount.
  const openingDealFiredRef = useRef(false);
  useEffect(() => {
    if (introFiredRef.current) return;
    introFiredRef.current = true;
    if (introPhase === 'done' && !openingDealFiredRef.current) {
      openingDealFiredRef.current = true;
      const indices: number[] = [];
      for (let i = 0; i < runner.state.hand.length; i++) indices.push(i);
      setTimeout(() => { void dealNewCards(indices); }, 180);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [introPhase]);

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

  // Element-type color palette — used for chain VFX, borders, connectors.
  function elementTypeColor(type: DamageType | string): string {
    switch (type) {
      case 'fire':     return '#ff6b35';
      case 'ice':      return '#7ec4ff';
      case 'thunder':  return '#facc15';
      case 'nature':   return '#4ade80';
      case 'holy':     return '#fde68a';
      case 'dark':     return '#a78bfa';
      case 'physical': return '#e2e8f0';
      // legacy
      case 'pyre':     return '#f97316';
      case 'frost':    return '#93c5fd';
      case 'arcane':   return '#c084fc';
      case 'pierce':   return '#fde68a';
      case 'steel':    return '#cbd5e1';
      default:         return '#cbd5e1';
    }
  }

  // Combo color for a slot: element chain color if in a chain, else null.
  function comboColorFor(slotIdx: number): string | null {
    const t = chainTypeMap.get(slotIdx);
    return t ? elementTypeColor(t) : null;
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


  function EnemyCard({ e, cardW, cardH, isBossEnemy, enemyIdx = 0 }: {
    e: EnemyState; cardW: number; cardH: number; isBossEnemy?: boolean; enemyIdx?: number;
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

    const hasDropped = droppedEnemies.has(enemyIdx);
    const isDropping = !hasDropped && introPhase === 'done';

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
          // Hidden before the drop fires, then animates in.
          opacity: isDropping ? 0 : (dead ? 0.4 : 1),
          filter: dead ? 'grayscale(1)' : flashing ? 'brightness(1.4) saturate(1.4)' : 'none',
          transition: 'opacity 200ms ease, filter 160ms ease',
          cursor: dead ? 'default' : (multipleEnemies ? 'pointer' : 'default'),
          animation: dead
            ? 'none'
            : hasDropped
              ? `sb-enemy-drop 0.55s cubic-bezier(0.22,1,0.36,1) both, breathe ${2.4 + enemyIdx * 0.37}s ${enemyIdx * 0.71}s ease-in-out 0.6s infinite`
              : introPhase === 'text'
                ? 'none'
                : 'none',
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
  const dmgTypeColor = (t: string): string => elementTypeColor(t as DamageType);

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

              {/* Card illustration — fills slot center, emoji fallback */}
              {(() => {
                const imgUrl = cardImageUrl(def.id, def.name);
                return imgUrl ? (
                  <div style={{
                    flex: 1,
                    width: '100%',
                    minHeight: 0,
                    position: 'relative',
                    overflow: 'hidden',
                    borderRadius: 4,
                    marginTop: 4,
                    flexShrink: 1,
                  }}>
                    <img
                      src={imgUrl}
                      alt={def.name}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center top',
                        filter: `drop-shadow(0 0 4px ${typeColor}66)`,
                        pointerEvents: 'none',
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: `linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.7) 100%)`,
                      borderRadius: 4,
                    }} />
                  </div>
                ) : (
                  <div style={{
                    fontSize: cardH < 80 ? 18 : 24,
                    lineHeight: 1,
                    filter: `drop-shadow(0 1px 3px rgba(0,0,0,0.8)) drop-shadow(0 0 6px ${typeColor}88)`,
                    marginTop: 6,
                    flexShrink: 0,
                  }}>
                    {def.emoji}
                  </div>
                );
              })()}

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
                {/* Damage preview — glows in element color when chained */}
                <div style={{
                  fontFamily: 'var(--sb-font-mono)',
                  fontSize: cardH < 80 ? 9 : 11,
                  fontWeight: 800,
                  color: comboColor ?? (ready ? 'var(--sb-crimson-light)' : typeColor),
                  textShadow: comboColor ? `0 0 10px ${comboColor}, 0 0 20px ${comboColor}60` : 'none',
                  letterSpacing: '0.02em',
                  lineHeight: 1,
                  flexShrink: 0,
                }}>
                  {dmgInfo ? `⚔${dmgInfo.effective}` : (slot.bound ? `⚔${slot.bound.damage}` : '')}
                </div>
                {/* Chain bonus badge */}
                {dmgInfo?.chainMult && dmgInfo.chainMult > 1 && dmgInfo.willResolve && (
                  <div style={{
                    fontFamily: 'var(--sb-font-mono)',
                    fontSize: 7,
                    fontWeight: 800,
                    color: comboColor ?? typeColor,
                    textShadow: `0 0 6px ${comboColor ?? typeColor}`,
                    letterSpacing: '0.02em',
                    flexShrink: 0,
                  }}>
                    ×{dmgInfo.chainMult.toFixed(2).replace(/\.?0+$/, '')}
                  </div>
                )}

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

  // Unified hand card renderer — action cards behave exactly as before
  // (drag/select/bind); tactic cards show a green tint and play on click.
  function HandCard({ entry, i, total, cardW, cardH, fan, isDiscardPicking, selectedForDiscard }: {
    entry: HandEntry; i: number; total: number;
    cardW: number; cardH: number;
    fan: { spacing: number; arcMul: number; rotMax: number };
    isDiscardPicking: boolean;
    selectedForDiscard: boolean;
  }) {
    const { realIndex } = entry;
    const dragging = draggingHandIdx === realIndex;
    const selected = selectedHandIdx === realIndex;
    const hovered = hoveredHandIdx === realIndex;
    const lifted = hovered || selected;
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

    const isTactic = entry.kind === 'tactic';
    const canAffordTactic = isTactic
      ? runner.state.staminaThisTurn >= (entry.def as NonNullable<ReturnType<typeof getTactic>>).cost
      : true;

    return (
      <div
        key={`${entry.def.id}-${realIndex}`}
        ref={(el) => {
          if (el) cardRefs.current.set(realIndex, el);
          else cardRefs.current.delete(realIndex);
        }}
        draggable={!isTactic && !isDiscardPicking}
        onClick={(ev) => {
          if (isDiscardPicking) {
            setDiscardPickSelected(prev => {
              const next = new Set(prev);
              if (next.has(realIndex)) next.delete(realIndex);
              else next.add(realIndex);
              return next;
            });
          } else {
            handleCardClick(realIndex, ev.currentTarget as HTMLDivElement);
          }
        }}
        onPointerDown={(ev) => {
          // Long press (550ms) always shows detail popup regardless of cardInfoEnabled.
          const el = ev.currentTarget;
          startLongPress(() => {
            cancelLongPress();
            const rect = el.getBoundingClientRect();
            const cardId = runner.state.hand[realIndex] ?? '';
            const def = getAction(cardId) ?? getTactic(cardId);
            if (def) {
              setHandCardPopup({ card: def, rect });
              setSelectedHandIdx(realIndex);
            }
          });
        }}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        onMouseEnter={() => setHoveredHandIdx(realIndex)}
        onMouseLeave={() => setHoveredHandIdx(prev => (prev === realIndex ? null : prev))}
        onDragStart={!isTactic ? (ev) => {
          ev.dataTransfer.setData('text/plain', String(realIndex));
          ev.dataTransfer.effectAllowed = 'move';
          setDraggingHandIdx(realIndex);
          setSelectedHandIdx(null);
          setHandCardPopup(null);
        } : undefined}
        onDragEnd={!isTactic ? () => { setDraggingHandIdx(null); setHoverSlotIdx(null); } : undefined}
        title={isTactic
          ? `${entry.def.name} — click to play`
          : `${entry.def.name} — tap a slot to bind`}
        style={{
          position: 'absolute',
          left: '50%', bottom: 18,
          marginLeft: -cardW / 2,
          width: cardW, height: cardH,
          cursor: isDiscardPicking ? 'pointer' : (isTactic ? (canAffordTactic ? 'pointer' : 'not-allowed') : 'grab'),
          opacity: isFlyingSource ? 0 : drawing ? 0 : (dragging ? 0.4 : (isTactic && !canAffordTactic ? 0.55 : 1)),
          visibility: isFlyingSource ? 'hidden' : 'visible',
          transformOrigin: 'center center',
          transform: drawing
            ? `translateX(${baseX}px) translateY(280px) rotate(${offsetIdx > 0 ? 22 : -22}deg) scale(0.7)`
            : `translateX(${baseX}px) translateY(${arcY - lift}px) rotate(${rot}deg) scale(${scale})`,
          transition: drawing
            ? `transform 0ms, opacity 0ms`
            : `transform 480ms cubic-bezier(0.34, 1.45, 0.64, 1), opacity 320ms ease-out`,
          willChange: 'transform',
          userSelect: 'none',
          pointerEvents: 'auto',
          zIndex: selected ? 200 : (hovered ? 150 : 10 + i),
          outline: selectedForDiscard ? '3px solid #ef4444' : undefined,
          borderRadius: selectedForDiscard ? 8 : undefined,
          filter: selectedForDiscard ? 'brightness(1.3)' : undefined,
        }}
      >
        <div className={isDiscardPicking && !selectedForDiscard ? 'sb-hand-discard-shake' : ''} style={{ width: '100%', height: '100%' }}>
          {isTactic
            ? <TacticCardDisplay
                card={entry.def as NonNullable<ReturnType<typeof getTactic>>}
                customWidth={cardW}
                disabled={!canAffordTactic && !isDiscardPicking}
              />
            : <ActionCardDisplay
                card={entry.def as NonNullable<ReturnType<typeof getAction>>}
                customWidth={cardW}
                selected={selected || hovered}
              />
          }
        </div>
      </div>
    );
  }

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

  // ── Battle intro overlay ─────────────────────────────────────────────────
  // Full-screen cinematic shown once per stage before the opening deal.
  // Phase 'text': show area name + narrative + tap to continue.
  // Phase 'drop': enemies fall into their positions with impact VFX.
  // Phase 'done': overlay gone, opening deal fires.

  const introEntry = getBattleIntro(stage.number, stage.biome);

  const BIOME_PALETTE: Record<string, { bg: string; accent: string; glow: string }> = {
    forest:    { bg: 'linear-gradient(160deg, #071a0b 0%, #0a1f0c 60%, #050d06 100%)', accent: '#4ade80', glow: 'rgba(74,222,128,0.25)' },
    crypts:    { bg: 'linear-gradient(160deg, #0d0a18 0%, #130c20 60%, #08060f 100%)', accent: '#c4b5fd', glow: 'rgba(196,181,253,0.25)' },
    frostpeak: { bg: 'linear-gradient(160deg, #050d18 0%, #091520 60%, #040d15 100%)', accent: '#93c5fd', glow: 'rgba(147,197,253,0.25)' },
    volcano:   { bg: 'linear-gradient(160deg, #1a0805 0%, #200b06 60%, #0f0503 100%)', accent: '#fca5a5', glow: 'rgba(252,165,165,0.25)' },
    ashen:     { bg: 'linear-gradient(160deg, #0f0f0f 0%, #141414 60%, #0a0a0a 100%)', accent: '#94a3b8', glow: 'rgba(148,163,184,0.22)' },
  };
  // ── Hand card detail popup ─────────────────────────────────────────────────
  // Shown when the player taps a hand card (first tap = select + show popup).
  // Positioned above the card, clamped to viewport. Dismissed by tapping the
  // backdrop, tapping the card again, or when the card is bound to a slot.
  const HandCardPopupLayer = handCardPopup && (() => {
    const { card, rect } = handCardPopup;
    const isTacticPopup = card.type === 'tactic';
    const tacticHandIdx = isTacticPopup ? selectedHandIdx : null;
    const canAfford = isTacticPopup
      ? runner.state.staminaThisTurn >= (card as NonNullable<ReturnType<typeof getTactic>>).cost
      : true;

    const accent = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common;
    const popW = Math.min(300, window.innerWidth - 24);
    const popH = isTacticPopup ? 380 : 340;
    const margin = 12;

    // Position above the card, centred on it, clamped to viewport.
    let left = rect.left + rect.width / 2 - popW / 2;
    left = Math.max(margin, Math.min(window.innerWidth - popW - margin, left));
    const spaceAbove = rect.top - margin;
    const top = spaceAbove >= popH
      ? rect.top - popH - 10
      : rect.bottom + 10;

    function dismiss() {
      setHandCardPopup(null);
      setSelectedHandIdx(null);
    }

    function playTacticFromPopup() {
      if (tacticHandIdx === null) return;
      setHandCardPopup(null);
      setSelectedHandIdx(null);
      handlePlayTactic(tacticHandIdx);
    }

    return (
      <>
        {/* Dimming backdrop */}
        <div
          aria-hidden
          onClick={dismiss}
          style={{ position: 'fixed', inset: 0, zIndex: 502, background: 'rgba(0,0,0,0.45)' }}
        />
        <div
          role="dialog"
          aria-label={`${card.name} details`}
          style={{
            position: 'fixed',
            top, left,
            width: popW,
            maxHeight: popH,
            overflowY: 'auto',
            zIndex: 503,
            borderRadius: 14,
            background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
            border: `1.5px solid ${accent}`,
            boxShadow: `0 0 28px ${accent}30, 0 16px 40px rgba(0,0,0,0.85)`,
            color: '#e2e8f0',
            animation: 'sb-pop-up 0.18s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
        >
          <div style={{ padding: 14 }}>
            <BattleCardDetail card={card} />
          </div>

          {isTacticPopup ? (
            /* Tactic popup footer — PLAY button + cancel */
            <div style={{
              padding: '8px 14px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}>
              <button
                onClick={playTacticFromPopup}
                disabled={!canAfford}
                style={{
                  flex: 1,
                  padding: '8px 0',
                  borderRadius: 7,
                  background: canAfford
                    ? `linear-gradient(180deg, ${accent} 0%, color-mix(in srgb, ${accent} 70%, #000) 100%)`
                    : 'rgba(60,40,20,0.5)',
                  border: `1.5px solid ${canAfford ? accent : 'rgba(255,235,180,0.12)'}`,
                  color: canAfford ? '#fff' : '#64748b',
                  fontFamily: 'var(--sb-font-display)',
                  fontSize: 13, fontWeight: 800, letterSpacing: '0.14em',
                  cursor: canAfford ? 'pointer' : 'not-allowed',
                  textShadow: canAfford ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
                  boxShadow: canAfford ? `0 0 12px ${accent}50` : 'none',
                }}
              >
                {canAfford ? '▶ PLAY' : '✕ NOT ENOUGH STAMINA'}
              </button>
              <button
                onClick={dismiss}
                style={{
                  padding: '8px 12px', borderRadius: 7,
                  background: 'rgba(196,146,42,0.1)',
                  border: '1px solid rgba(196,146,42,0.25)',
                  color: 'var(--sb-gold-light)', cursor: 'pointer',
                  fontSize: 12, fontWeight: 700,
                }}
              >✕</button>
            </div>
          ) : (
            /* Action card popup footer */
            <div style={{
              padding: '6px 14px 10px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '0.5rem', color: '#475569', fontStyle: 'italic' }}>
                Tap card again to place · tap outside to close
              </span>
              <button
                onClick={dismiss}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: 'rgba(196,146,42,0.12)',
                  border: '1px solid rgba(196,146,42,0.3)',
                  color: 'var(--sb-gold-light)', cursor: 'pointer',
                  fontSize: '0.65rem', fontWeight: 800,
                }}
              >✕</button>
            </div>
          )}
        </div>
      </>
    );
  })();

  const biomePal = BIOME_PALETTE[stage.biome] ?? BIOME_PALETTE.forest;

  const BattleIntroOverlay = introPhase !== 'done' && (
    <div
      aria-label="Battle introduction"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 600,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: biomePal.bg,
        animation: 'sb-intro-bg-in 0.5s ease both',
      }}
    >
      {/* Atmospheric glow */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${biomePal.glow} 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Stage number badge */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 24,
        fontFamily: "'Fredoka One', cursive",
        fontSize: '0.75rem',
        letterSpacing: '0.18em',
        color: biomePal.accent,
        opacity: 0.6,
        animation: 'sb-intro-text-in 0.6s 0.2s ease both',
      }}>
        STAGE {stage.number}
      </div>

      {/* Biome label */}
      <div style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: '0.65rem',
        fontWeight: 800,
        letterSpacing: '0.45em',
        color: biomePal.accent,
        opacity: 0.75,
        marginBottom: 10,
        textTransform: 'uppercase',
        animation: 'sb-intro-text-in 0.5s 0.15s ease both',
      }}>
        {{ forest: 'Whispering Forest', crypts: 'Sunken Crypts', frostpeak: 'Frostpeak Hollows', volcano: 'Volcanic Forge', ashen: 'Ashen Citadel' }[stage.biome] ?? stage.biome}
      </div>

      {/* Divider */}
      <div style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${biomePal.accent}, transparent)`,
        animation: 'sb-intro-divider 0.6s 0.3s ease both',
        width: '60%',
        marginBottom: 20,
        opacity: 0.5,
      }} />

      {/* Area / stage title */}
      <div style={{
        fontFamily: "'Fredoka One', cursive",
        fontSize: 'clamp(1.4rem, 5vw, 2.6rem)',
        color: '#f1f5f9',
        textAlign: 'center',
        letterSpacing: '0.28em',
        lineHeight: 1.1,
        maxWidth: '80vw',
        textShadow: `0 2px 0 rgba(0,0,0,0.7), 0 0 30px ${biomePal.glow}`,
        animation: 'sb-intro-title-in 0.7s 0.35s cubic-bezier(0.16,1,0.3,1) both',
        marginBottom: 8,
      }}>
        {stage.isBoss ? '⚔ ' : ''}{introEntry.areaName}
      </div>

      {/* Stage hand-tuned title if different from area name */}
      {stage.title !== introEntry.areaName && (
        <div style={{
          fontFamily: "'Nunito', sans-serif",
          fontSize: 'clamp(0.7rem, 2.5vw, 0.95rem)',
          fontWeight: 800,
          letterSpacing: '0.15em',
          color: biomePal.accent,
          opacity: 0.8,
          marginBottom: 22,
          animation: 'sb-intro-text-in 0.5s 0.55s ease both',
        }}>
          {stage.title}
        </div>
      )}

      {/* Divider bottom */}
      <div style={{
        height: 1,
        background: `linear-gradient(90deg, transparent, ${biomePal.accent}, transparent)`,
        animation: 'sb-intro-divider 0.6s 0.5s ease both',
        width: '60%',
        marginTop: stage.title !== introEntry.areaName ? 0 : 16,
        marginBottom: 24,
        opacity: 0.35,
      }} />

      {/* Scene description */}
      <div style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: 'clamp(0.72rem, 2.2vw, 0.88rem)',
        fontWeight: 600,
        color: '#cbd5e1',
        textAlign: 'center',
        lineHeight: 1.65,
        maxWidth: 'min(540px, 88vw)',
        opacity: 0.9,
        fontStyle: 'italic',
        animation: 'sb-intro-text-in 0.6s 0.65s ease both',
        marginBottom: 16,
      }}>
        {introEntry.scene}
      </div>

      {/* Encounter description */}
      <div style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: 'clamp(0.72rem, 2.2vw, 0.88rem)',
        fontWeight: 700,
        color: '#e2e8f0',
        textAlign: 'center',
        lineHeight: 1.65,
        maxWidth: 'min(540px, 88vw)',
        opacity: 0.95,
        animation: 'sb-intro-text-in 0.6s 0.9s ease both',
        marginBottom: 36,
      }}>
        {introEntry.encounter}
      </div>

      {/* Tap to continue */}
      <button
        onClick={() => {
          try { sfx.cardDraw?.(); } catch (_) { /* optional */ }
          startEnemyDropIn();
        }}
        style={{
          fontFamily: "'Fredoka One', cursive",
          fontSize: '0.82rem',
          letterSpacing: '0.25em',
          color: biomePal.accent,
          background: 'transparent',
          border: `1.5px solid ${biomePal.accent}`,
          borderRadius: 8,
          padding: '10px 28px',
          cursor: 'pointer',
          animation: 'sb-intro-dismiss 2s 1.5s ease infinite',
          boxShadow: `0 0 16px ${biomePal.glow}`,
        }}
      >
        TAP TO ENTER ▶
      </button>
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

  // ── Tactic play overlay ──────────────────────────────────────────────────
  // Three phases rendered on a single fixed-pos layer (zIndex 215).
  // 'flying'    — card body driven by rAF via tacticPlayOverlayRef.
  // 'shattering'— card hidden; shard particles + screen flash spread out.
  // 'announcing'— semi-transparent backdrop + large effect text banner.
  const TacticPlayOverlay = tacticPlay && (() => {
    const { def, phase, cardW, cardH, from, announceText, accentColor } = tacticPlay;

    // Shard seeds — deterministic per card id so they're stable across renders.
    const shardSeeds = Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + i * 0.42;
      const dist  = 38 + (i % 4) * 22;
      const size  = 6 + (i % 5) * 5;
      return {
        sx: `${Math.cos(angle) * dist}px`,
        sy: `${Math.sin(angle) * dist}px`,
        sr: `${(i * 37) % 360}deg`,
        size,
        delay: `${(i * 0.028).toFixed(3)}s`,
        color: i % 3 === 0 ? accentColor : i % 3 === 1 ? '#fff' : accentColor + 'aa',
        shape: i % 4 === 0 ? 'triangle' : i % 4 === 1 ? 'square' : i % 4 === 2 ? 'long' : 'dot',
      };
    });

    return (
      <>
        {/* Dim backdrop for shattering and announcing phases */}
        {(phase === 'shattering' || phase === 'announcing') && (
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0,
              background: phase === 'announcing'
                ? 'rgba(0,0,0,0.62)'
                : 'rgba(0,0,0,0.30)',
              zIndex: 214,
              transition: 'background 0.2s',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Flying card — visible only during 'flying' phase, rAF-driven */}
        {phase === 'flying' && (
          <div
            ref={tacticPlayOverlayRef}
            aria-hidden
            style={{
              position: 'fixed', left: 0, top: 0,
              width: cardW, height: cardH,
              transform: `translate3d(${from.x}px, ${from.y}px, 0)`,
              transformOrigin: 'center center',
              willChange: 'transform, opacity',
              pointerEvents: 'none',
              userSelect: 'none',
              filter: `drop-shadow(0 0 22px ${accentColor}) drop-shadow(0 10px 24px rgba(0,0,0,0.8))`,
              zIndex: 215,
            }}
          >
            <TacticCardDisplay card={def} customWidth={cardW} selected />
          </div>
        )}

        {/* Shatter phase — card face frozen at centre + shard burst */}
        {phase === 'shattering' && (() => {
          const cx = window.innerWidth  / 2;
          const cy = window.innerHeight / 2;
          return (
            <div
              aria-hidden
              style={{
                position: 'fixed', left: 0, top: 0,
                width: '100%', height: '100%',
                pointerEvents: 'none',
                zIndex: 215,
              }}
            >
              {/* Screen flash ring */}
              <div style={{
                position: 'absolute',
                left: cx - 80, top: cy - 80,
                width: 160, height: 160,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${accentColor}88 0%, transparent 70%)`,
                animation: 'sb-impact-ring 0.45s ease-out both',
                pointerEvents: 'none',
              }} />

              {/* Card ghost — pulses then shatters */}
              <div style={{
                position: 'absolute',
                left: cx - cardW / 2, top: cy - cardH / 2,
                width: cardW, height: cardH,
                animation: 'sb-tactic-pulse 0.28s ease-in both',
                color: accentColor,
                pointerEvents: 'none',
              }}>
                <TacticCardDisplay card={def} customWidth={cardW} />
              </div>

              {/* Shards */}
              {shardSeeds.map((s, i) => (
                <div
                  key={i}
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: cx, top: cy,
                    width: s.shape === 'long' ? s.size * 0.4 : s.shape === 'dot' ? s.size * 0.6 : s.size,
                    height: s.shape === 'long' ? s.size * 2.5 : s.size,
                    borderRadius: s.shape === 'dot' ? '50%' : s.shape === 'triangle' ? '2px' : '1px',
                    background: s.color,
                    boxShadow: `0 0 6px ${s.color}`,
                    pointerEvents: 'none',
                    // CSS custom properties for the keyframe
                    ['--sx' as string]: s.sx,
                    ['--sy' as string]: s.sy,
                    ['--sr' as string]: s.sr,
                    animation: `sb-tactic-shard 0.50s cubic-bezier(0.2, 0.8, 0.4, 1) ${s.delay} both`,
                  }}
                />
              ))}
            </div>
          );
        })()}

        {/* Announce phase — effect text banner */}
        {phase === 'announcing' && (() => {
          const isGood = !['enemy_damage_debuff', 'apply_status_all_enemies'].includes(def.effect.kind);
          return (
            <div
              aria-live="polite"
              style={{
                position: 'fixed',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 216,
                pointerEvents: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                animation: 'sb-tactic-announce-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1) both',
              }}
            >
              {/* Card name strip */}
              <div style={{
                fontFamily: 'var(--sb-font-display)',
                fontSize: 'clamp(11px, 2.5vw, 15px)',
                letterSpacing: '0.18em',
                color: accentColor,
                opacity: 0.9,
                textShadow: `0 0 12px ${accentColor}`,
                textTransform: 'uppercase',
              }}>
                {def.emoji} {def.name}
              </div>

              {/* Effect text — large and dramatic */}
              <div style={{
                fontFamily: 'var(--sb-font-display)',
                fontSize: 'clamp(22px, 7vw, 42px)',
                fontWeight: 900,
                letterSpacing: '0.08em',
                color: isGood ? accentColor : '#fca5a5',
                textShadow: `0 2px 0 rgba(0,0,0,0.8), 0 0 28px ${isGood ? accentColor : '#ef4444'}`,
                textTransform: 'uppercase',
                textAlign: 'center',
                padding: '0 16px',
                lineHeight: 1.15,
              }}>
                {announceText}
              </div>
            </div>
          );
        })()}
      </>
    );
  })();

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
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.72)' }}
      />
      <div style={{
        position: 'fixed', zIndex: 51,
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%)',
        maxWidth: 'min(360px, calc(100vw - 32px))',
        width: '100%',
        background: 'linear-gradient(160deg, #111c13 0%, #0c1310 100%)',
        border: `1.5px solid ${infoModal.kind === 'enemy' ? (infoModal.enemy.archetype === 'boss' ? '#fbbf24' : ({ easy: '#4ade80', medium: '#fb923c', hard: '#f87171' } as Record<string,string>)[getEnemy(infoModal.enemy.defId)?.difficulty ?? 'medium'] ?? '#fb923c') : 'var(--sb-gold)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 16px 50px rgba(0,0,0,0.9)',
        color: '#e2e8f0',
      }}>
        {infoModal.kind === 'enemy' ? (() => {
          const en = infoModal.enemy;
          const def = getEnemy(en.defId);
          const difficulty = def?.difficulty ?? 'medium';
          const accentColor = ({ easy: '#4ade80', medium: '#fb923c', hard: '#f87171' } as Record<string,string>)[difficulty] ?? '#fb923c';
          const accent = en.archetype === 'boss' ? '#fbbf24' : accentColor;
          const DMG_COLORS: Record<string,string> = { physical: '#fbbf24', fire: '#f97316', ice: '#67e8f9', thunder: '#facc15', lightning: '#facc15', nature: '#86efac', holy: '#fde68a', dark: '#818cf8', steel: '#94a3b8', pierce: '#cbd5e1', pyre: '#f97316', frost: '#67e8f9', arcane: '#c084fc', void: '#a78bfa' };
          const dmgColor = DMG_COLORS[en.damageType] ?? '#cbd5e1';
          const statRows: Array<[string, string, string]> = [
            ['❤  HP',      `${en.currentHp} / ${en.maxHp}`, '#f87171'],
            ['🛡  DEF',     String(en.def ?? 0),              '#60a5fa'],
            ['⚡  Intent',  intentDisplay(en.intent),         '#fcd34d'],
          ];
          const resistRows = Object.entries(en.resistances ?? {})
            .filter(([, v]) => (v as number) !== 0)
            .map(([k, v]): [string, string, string] => [
              k.toUpperCase(),
              (v as number) > 0 ? `+${Math.round((v as number) * 100)}%` : `${Math.round((v as number) * 100)}%`,
              (v as number) > 0 ? '#f87171' : '#86efac',
            ]);
          return (
            <div>
              {/* Header */}
              <div style={{
                padding: '14px 16px 12px',
                background: `linear-gradient(160deg, ${accent}12 0%, transparent 70%)`,
                borderBottom: `1px solid ${accent}22`,
                display: 'flex',
                gap: 12,
                alignItems: 'center',
              }}>
                {def && (
                  <div style={{ flexShrink: 0 }}>
                    <EnemyCardDisplay enemy={def} size="sm" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#f1f5f9', lineHeight: 1.2 }}>
                    {def?.name ?? en.defId.replace(/_/g, ' ')}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em',
                      padding: '2px 7px', borderRadius: 99,
                      background: accent, color: '#0f172a',
                    }}>
                      {en.archetype === 'boss' ? 'BOSS' : difficulty.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: dmgColor, letterSpacing: '0.06em' }}>
                      {(en.damageType ?? 'physical').toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
              {/* Stat block */}
              <div style={{ padding: '10px 16px' }}>
                <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '8px 12px', marginBottom: 10 }}>
                  {statRows.map(([label, val, color]) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color }}>{val}</span>
                    </div>
                  ))}
                </div>
                {resistRows.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em', color: '#475569', marginBottom: 5 }}>
                      RESISTANCES
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {resistRows.map(([label, val, color]) => (
                        <div key={label} style={{
                          padding: '3px 8px', borderRadius: 6,
                          background: 'rgba(0,0,0,0.25)', border: `1px solid ${color}30`,
                          display: 'flex', gap: 5, alignItems: 'center',
                        }}>
                          <span style={{ fontSize: '0.62rem', color: '#64748b' }}>{label}</span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 800, color }}>{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {def?.lore && (
                  <div style={{
                    marginTop: 10, padding: '8px 10px',
                    background: 'rgba(255,255,255,0.03)',
                    borderLeft: `2px solid ${accent}40`,
                    borderRadius: '0 6px 6px 0',
                  }}>
                    <div style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.12em', color: '#475569', marginBottom: 3 }}>LORE</div>
                    <p style={{ fontSize: '0.68rem', lineHeight: 1.5, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                      {def.lore}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })() : (() => {
          const stats = p.stats;
          const rows: Array<[string, string, string]> = [
            ['❤  HP',      `${p.currentHp} / ${stats.maxHp}`, '#f87171'],
            ['⚔  ATK',     String(stats.atk),                  '#fbbf24'],
            ['🛡  DEF',     String(stats.def),                  '#60a5fa'],
            ['🔰  BLOCK',   String(p.block),                    '#93c5fd'],
            ['✦  CRIT',    `${Math.round(stats.critChance * 100)}%`, '#c084fc'],
            ['🃏  DECK',    String(runner.state.deck.length),   '#94a3b8'],
            ['♻  DISCARD', String(runner.state.discard.length), '#64748b'],
          ];
          return (
            <div>
              <div style={{
                padding: '14px 16px 12px',
                background: 'linear-gradient(160deg, rgba(196,146,42,0.1) 0%, transparent 70%)',
                borderBottom: '1px solid rgba(196,146,42,0.15)',
              }}>
                <div style={{ fontFamily: "'Fredoka One', cursive", fontSize: '1rem', color: '#f1f5f9' }}>
                  {playerAvatar} {playerName}
                </div>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.1em', color: 'var(--sb-gold)', marginTop: 4 }}>
                  PLAYER STATS
                </div>
              </div>
              <div style={{ padding: '10px 16px' }}>
                <div style={{ background: 'rgba(0,0,0,0.28)', borderRadius: 8, padding: '8px 12px' }}>
                  {rows.map(([label, val, color]) => (
                    <div key={label} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{label}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}
        <div style={{ padding: '0 16px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setInfoModal(null)}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 8, marginTop: 10,
              background: 'rgba(196,146,42,0.12)',
              border: '1.5px solid rgba(196,146,42,0.35)',
              color: 'var(--sb-gold-light)', cursor: 'pointer',
              fontFamily: "'Nunito', sans-serif", fontSize: '0.78rem', fontWeight: 800,
              letterSpacing: '0.06em',
            }}
          >
            CLOSE
          </button>
        </div>
      </div>
    </>
  );

  // SVG connector lines between adjacent slots that share an element chain.
  // Thick glowing elemental lines with animated flow particles.
  function AdjacentComboConnectors({ slots, slotCardW, slotCardH, slotGap }: {
    slots: typeof runner.state.slots; slotCardW: number; slotCardH: number; slotGap: number;
  }) {
    const totalW = slots.length * slotCardW + (slots.length - 1) * slotGap;
    const connectors: JSX.Element[] = [];
    for (let i = 0; i < slots.length - 1; i++) {
      const j = i + 1;
      const ci = comboColorFor(i);
      const cj = comboColorFor(j);
      if (!ci || !cj || ci !== cj) continue;
      const color = ci;
      const x1 = i * (slotCardW + slotGap) + slotCardW;
      const x2 = j * (slotCardW + slotGap);
      const y  = slotCardH / 2;
      const gradId = `ecg-${i}-${j}`;
      connectors.push(
        <g key={`${i}-${j}`}>
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="50%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.4" />
            </linearGradient>
          </defs>
          {/* Outer glow */}
          <line x1={x1} y1={y} x2={x2} y2={y}
            stroke={color} strokeWidth={10} opacity={0.18}
            strokeLinecap="round"
          />
          {/* Main beam */}
          <line x1={x1} y1={y} x2={x2} y2={y}
            stroke={`url(#${gradId})`} strokeWidth={4}
            strokeLinecap="round"
          />
          {/* Animated energy pulse */}
          <line x1={x1} y1={y} x2={x2} y2={y}
            stroke={color} strokeWidth={2}
            strokeDasharray="8 12" strokeLinecap="round"
            style={{ animation: 'sb-chain-flow 0.9s linear infinite' }}
          />
        </g>
      );
    }
    if (connectors.length === 0) return null;
    return (
      <svg
        width={totalW} height={slotCardH}
        style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 2 }}
        aria-hidden
      >
        {connectors}
      </svg>
    );
  }

  // Inline Element Chain preview banner shown below the slot row.
  function ComboPreviewBanner({ compact }: { compact: boolean }) {
    if (animating) return null;
    const chains = comboPreview.chains;
    if (chains.length === 0) return null;
    const ELEMENT_ICONS: Partial<Record<string, string>> = {
      fire: '🔥', ice: '❄', thunder: '⚡', nature: '🌿', holy: '✦', dark: '🌑', physical: '⚔',
      pyre: '🔥', frost: '❄', arcane: '✦', pierce: '⚔', steel: '⚔',
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
        {chains.map((chain, ci) => {
          const color = elementTypeColor(chain.type);
          const icon = ELEMENT_ICONS[chain.type] ?? '◆';
          const total = chain.indices.reduce((s, idx) => s + (slotDamagePreview[idx]?.effective ?? 0), 0);
          const pctBonus = Math.round((chain.multiplier - 1) * 100);
          const label = (chain.type.charAt(0).toUpperCase() + chain.type.slice(1)).toUpperCase();
          return (
            <div key={ci} style={{
              display: 'flex', alignItems: 'center', gap: compact ? 5 : 8,
              padding: compact ? '3px 10px' : '4px 14px',
              background: `${color}18`,
              border: `1.5px solid ${color}`,
              borderRadius: 4,
              boxShadow: `0 0 12px ${color}50, inset 0 0 8px ${color}10`,
            }}>
              <span style={{
                fontFamily: 'var(--sb-font-display)',
                fontSize: compact ? 9 : 11,
                fontWeight: 700, color,
                letterSpacing: '0.16em',
                textShadow: `0 0 10px ${color}`,
              }}>
                {icon} {label} CHAIN ×{chain.indices.length}
              </span>
              <span style={{
                fontFamily: 'var(--sb-font-mono)',
                fontSize: compact ? 8 : 9,
                color: 'rgba(255,235,180,0.5)',
                letterSpacing: '0.06em',
              }}>
                SLOTS {chain.indices.map(s => s + 1).join('+')}
              </span>
              <span style={{
                fontFamily: 'var(--sb-font-mono)',
                fontSize: compact ? 9 : 11,
                fontWeight: 800, color,
                letterSpacing: '0.04em',
                textShadow: `0 0 8px ${color}80`,
              }}>
                +{pctBonus}% · ⚔{total}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Element Chain combo flash — fires when a chain resolves during END TURN.
  const ComboFlashLayer = comboFlash && (() => {
    const color = elementTypeColor(comboFlash.type);
    const ELEMENT_ICONS: Partial<Record<string, string>> = {
      fire: '🔥', ice: '❄', thunder: '⚡', nature: '🌿', holy: '✦', dark: '🌑', physical: '⚔',
      pyre: '🔥', frost: '❄', arcane: '✦', pierce: '⚔', steel: '⚔',
    };
    const icon = ELEMENT_ICONS[comboFlash.type] ?? '◆';
    const label = (comboFlash.type.charAt(0).toUpperCase() + comboFlash.type.slice(1)).toUpperCase();
    const pct = Math.round((elementChainMultiplier(comboFlash.chainLength) - 1) * 100);
    const slotLabel = comboFlash.slotIndices.length > 0
      ? `SLOTS ${comboFlash.slotIndices.map(s => s + 1).join(' + ')}`
      : '';
    return (
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
          background: `rgba(10,7,4,0.92)`,
          border: `3px solid ${color}`,
          color: color,
          fontFamily: 'var(--sb-font-display)',
          textShadow: `0 0 18px ${color}`,
          boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 40px ${color}40, inset 0 0 0 1px ${color}30`,
        }}
      >
        <div style={{ fontSize: isMobile ? 18 : 26, fontWeight: 700, letterSpacing: '0.18em' }}>
          {icon}  {label} CHAIN  {icon}
        </div>
        <div style={{
          fontSize: isMobile ? 12 : 16, fontWeight: 700, letterSpacing: '0.1em',
          marginTop: 4, color,
          textShadow: `0 0 12px ${color}`,
        }}>
          ×{comboFlash.chainLength} CARDS · +{pct}% DAMAGE
        </div>
        {slotLabel && (
          <div style={{
            fontSize: isMobile ? 9 : 11, fontWeight: 600, letterSpacing: '0.2em',
            marginTop: 4, opacity: 0.65,
            fontFamily: 'var(--sb-font-mono)',
          }}>
            {slotLabel}
          </div>
        )}
      </div>
    );
  })();

  const containerStyle = {
    background: 'radial-gradient(ellipse at top, rgba(185,28,28,0.12) 0%, transparent 55%), linear-gradient(180deg, #0f0a07 0%, #18120e 50%, #0f0a07 100%)',
    color: 'var(--sb-gold-light)',
  } as const;

  // ============================================================
  //                       MOBILE LAYOUT
  // ============================================================
  if (isMobile) {
    const screenW = typeof window !== 'undefined' ? window.innerWidth  : 375;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 667;

    // ── Hand sizing ─────────────────────────────────────────────────────────
    // Use allCardsInHand (actions + tactics) for correct count-based sizing.
    const handTotal = allCardsInHand.length;
    // Card width stays as large as possible for readability. We allow heavy
    // overlap — spacing can be much smaller than cardW. Minimum cardW = 88px
    // so the name + stats remain legible on a 375px phone.
    const cardW = handTotal >= 7 ? 88 : handTotal >= 5 ? 96 : 108;
    const cardH = Math.round(cardW * 1.42);
    // Spacing controls the fan spread (centre-to-centre offset between cards).
    // Fan total span = (handTotal-1) × spacing, must fit within screen - margin.
    const maxFanSpan = screenW - 32;
    const rawSpacing = handTotal >= 8 ? 38 : handTotal >= 6 ? 44 : handTotal >= 5 ? 52 : 62;
    // Constrain spacing so (handTotal-1)*spacing ≤ maxFanSpan
    const spacing = handTotal > 1
      ? Math.min(rawSpacing, Math.floor(maxFanSpan / (handTotal - 1)))
      : rawSpacing;

    // Hand area height: tallest possible card position + lift + breathing room.
    // Cards arc up by arcMul × offsetIdx², max arc for outermost card in large hands.
    const arcMul = 0.8;
    const maxOffsetIdx = (handTotal - 1) / 2;
    const maxArcY = maxOffsetIdx * maxOffsetIdx * arcMul;
    const maxLift = 28; // selected card lift
    const handAreaHeight = cardH + Math.ceil(maxArcY) + maxLift + 24;

    // ── Enemy row sizing ────────────────────────────────────────────────────
    const paddingX = 16;
    const availableWidth = screenW - paddingX;
    const enemies = runner.state.enemies;
    const enemyCount = enemies.length;
    // Account for boss cards being wider when computing fit.
    const hasBoss = enemies.some(e => getEnemy(e.defId)?.archetype === 'boss');
    // Effective "unit" width including the boss premium so our fit check is accurate.
    // We solve for baseEnemyW such that total row width ≤ availableWidth.
    // Start with 1.5× hand card as target.
    let enemyCardW = Math.round(cardW * 1.5);
    let enemyCardH = Math.round(enemyCardW * 1.4);
    let enemyGap = 10;

    const rowWidth = (count: number, w: number, g: number, boss: boolean) => {
      // Boss card is 1.35× wide; a regular enemy count is (count - bossCount) regular + bossCount boss.
      const bossW = Math.round(w * 1.35);
      const bossCount = boss ? 1 : 0;
      return (count - bossCount) * w + bossCount * bossW + Math.max(0, count - 1) * g;
    };

    if (rowWidth(enemyCount, enemyCardW, enemyGap, hasBoss) > availableWidth) {
      // Reduce gap first.
      enemyGap = 6;
      if (rowWidth(enemyCount, enemyCardW, enemyGap, hasBoss) > availableWidth) {
        // Solve for cardW: availableWidth = (count - bossCount)*w + bossCount*1.35w + (count-1)*gap
        // = w*(count - bossCount + 1.35*bossCount) + (count-1)*gap
        const bossCount = hasBoss ? 1 : 0;
        const widthUnits = (enemyCount - bossCount) + 1.35 * bossCount;
        const solved = (availableWidth - (enemyCount - 1) * enemyGap) / widthUnits;
        enemyCardW = Math.max(52, Math.floor(solved));
        enemyCardH = Math.round(enemyCardW * 1.4);
      }
    }

    // ── Vertical budget check ───────────────────────────────────────────────
    // Reserve: topBar≈72 + bottomBar≈90 + slots≈110 + handArea + enemy row.
    // If the enemy row + hand area would exceed available middle space, shrink
    // enemy cards further so both sections fit without scrolling.
    const topBarH   = 72;
    const bottomBarH = 90;
    const slotsH    = runner.state.slots.length >= 5 ? 106 : 118;
    const middleH   = screenH - topBarH - bottomBarH - slotsH;
    const enemyRowH = enemyCardH + 12; // +padding
    if (enemyRowH + handAreaHeight > middleH) {
      // Shrink enemy cards proportionally to reclaim space for hand.
      const availH = Math.max(middleH - handAreaHeight, 40);
      const targetH = availH - 12;
      if (targetH < enemyCardH) {
        enemyCardH = Math.max(40, targetH);
        enemyCardW = Math.round(enemyCardH / 1.4);
      }
    }

    return (
      <div
        className={`relative w-full h-full overflow-hidden flex flex-col safe-top safe-bottom ${screenShake === 'heavy' ? 'sb-shake-heavy' : screenShake === 'light' ? 'sb-shake-light' : ''}${introShaking ? ' sb-intro-shake' : ''}`}
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
            {/* Card info popup toggle */}
            <button
              onClick={toggleCardInfo}
              title={cardInfoEnabled ? 'Card info ON — tap to turn off' : 'Card info OFF — tap to turn on'}
              style={{
                flexShrink: 0,
                width: 36, height: 36,
                borderRadius: 4,
                background: cardInfoEnabled
                  ? 'linear-gradient(180deg, #1a3a1a 0%, #0e2010 100%)'
                  : 'rgba(0,0,0,0.4)',
                border: `1.5px solid ${cardInfoEnabled ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
                color: cardInfoEnabled ? '#4ade80' : '#475569',
                fontSize: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 200ms, border-color 200ms, color 200ms',
              }}
              aria-pressed={cardInfoEnabled}
              aria-label="Toggle card info popup"
            >📖</button>
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
          style={{ gap: `${enemyGap}px`, overflow: 'hidden', flexWrap: 'nowrap' }}
        >
          {runner.state.enemies.map((e, ei) => {
            const isBossEnemy = getEnemy(e.defId)?.archetype === 'boss';
            const w = isBossEnemy ? Math.round(enemyCardW * 1.35) : enemyCardW;
            const h = isBossEnemy ? Math.round(enemyCardH * 1.35) : enemyCardH;
            return EnemyCard({ e, cardW: w, cardH: h, isBossEnemy, enemyIdx: ei });
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

        {/* ── HAND FAN ── */}
        {/* overflow-x hidden prevents fan edges escaping viewport;
            overflow-y visible lets selected/lifted cards pop up above the row. */}
        <div className="relative flex-shrink-0 flex justify-center items-end" style={{
          height: handAreaHeight,
          pointerEvents: 'none',
          overflowX: 'hidden',
          overflowY: 'visible',
        }}>
          <div style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
            {allCardsInHand.map((entry, i) =>
              HandCard({
                entry, i, total: handTotal,
                cardW, cardH,
                fan: { spacing, arcMul: 0.8, rotMax: 4 },
                isDiscardPicking: pendingDiscard,
                selectedForDiscard: discardPickSelected.has(entry.realIndex),
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
              disabled={animating || isDealing || pendingDiscard}
              style={{
                flexShrink: 0,
                width: 64,
                height: 52,
                background: (animating || isDealing || pendingDiscard)
                  ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
                  : 'linear-gradient(180deg, #1e3a5f 0%, #0f1e33 100%)',
                border: '2.5px solid #7ec4ff',
                borderRadius: 6,
                color: (animating || isDealing || pendingDiscard) ? '#4a6a8a' : '#7ec4ff',
                fontFamily: 'var(--sb-font-display)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.1em',
                cursor: (animating || isDealing || pendingDiscard) ? 'not-allowed' : 'pointer',
                textShadow: (animating || isDealing || pendingDiscard) ? 'none' : '0 0 8px #7ec4ff80',
                boxShadow: (animating || isDealing || pendingDiscard)
                  ? 'none'
                  : 'inset 0 1px 0 rgba(126,196,255,0.3), 0 0 12px rgba(126,196,255,0.2)',
                opacity: (animating || isDealing || pendingDiscard) ? 0.5 : 1,
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
              disabled={animating || isDealing || pendingDiscard}
              style={{
                flex: 1,
                height: 52,
                background: (animating || isDealing || pendingDiscard)
                  ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
                  : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
                border: '2.5px solid var(--sb-gold)',
                borderRadius: 6,
                color: (animating || isDealing || pendingDiscard) ? '#8b6238' : 'var(--sb-gold-light)',
                fontFamily: 'var(--sb-font-display)',
                fontSize: 16, fontWeight: 700, letterSpacing: '0.14em',
                cursor: (animating || isDealing || pendingDiscard) ? 'not-allowed' : 'pointer',
                textShadow: '0 1px 2px rgba(0,0,0,0.85)',
                boxShadow: (animating || isDealing || pendingDiscard)
                  ? 'none'
                  : 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.5)',
                opacity: (animating || isDealing || pendingDiscard) ? 0.7 : 1,
                flexShrink: 0,
              }}
            >
              {animating ? '⚔ RESOLVING…' : isDealing ? '✦ DEALING…' : pendingDiscard ? '✦ DISCARD…' : '▶ END TURN'}
            </button>
          </div>

          {/* Player HP bar — compact, full-width */}
          {PlayerBar({ compact: true })}
        </div>

        {/* ── DISCARD PICKER OVERLAY (mobile) ── */}
        {pendingDiscard && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-end pb-32 px-4 pointer-events-none">
            <div className="pointer-events-auto" style={{
              background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
              border: '2px solid var(--sb-crimson)',
              borderRadius: 8, padding: '10px 14px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
              textAlign: 'center', width: '100%', maxWidth: 320,
            }}>
              <div className="sb-display" style={{ fontSize: 12, color: 'var(--sb-gold-light)', letterSpacing: '0.2em', marginBottom: 6 }}>
                CHOOSE {runner.state.pendingDiscardCount} CARD{runner.state.pendingDiscardCount > 1 ? 'S' : ''} TO DISCARD
              </div>
              <div className="sb-mono" style={{ fontSize: 10, color: '#94a3b8', marginBottom: 8 }}>
                {discardPickSelected.size} / {runner.state.pendingDiscardCount} selected
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  onClick={handleConfirmDiscard}
                  disabled={discardPickSelected.size !== runner.state.pendingDiscardCount}
                  className="sb-btn-primary"
                  style={{ padding: '6px 18px', fontSize: 11, opacity: discardPickSelected.size !== runner.state.pendingDiscardCount ? 0.45 : 1 }}
                >
                  CONFIRM
                </button>
              </div>
            </div>
          </div>
        )}

        {ChargeAuraLayer}
        {ComboFlashLayer}
        {FlyingCardOverlay}
        {DealCardOverlay}
        {TacticPlayOverlay}
        {ProjectileLayer}
        {ImpactRingLayer}
        {FireballExplosionLayer}
        {SlashLayer}
        {ParticleLayer}
        {FloaterLayer}
        {InfoModal}
        {HandCardPopupLayer}
        {OutcomeAnnounceLayer}
        {ConfirmDialogLayer}
        {BattleIntroOverlay}
      </div>
    );
  }

  // ============================================================
  //                       DESKTOP LAYOUT
  // ============================================================
  return (
    <div
      className={`relative w-full h-full overflow-hidden ${screenShake === 'heavy' ? 'sb-shake-heavy' : screenShake === 'light' ? 'sb-shake-light' : ''}${introShaking ? ' sb-intro-shake' : ''}`}
      style={containerStyle}
    >
      <style>{`
        @keyframes sb-pop-up {
          from { opacity: 0; transform: scale(0.88) translateY(10px); }
          to   { opacity: 1; transform: scale(1)    translateY(0px); }
        }
        @keyframes breathe {
          0%   { transform: scale(1)     translateY(0px)  translateX(0px); }
          30%  { transform: scale(1.013) translateY(-2px) translateX(-0.5px); }
          65%  { transform: scale(1.016) translateY(-3px) translateX(0.8px); }
          85%  { transform: scale(1.011) translateY(-2px) translateX(-0.3px); }
          100% { transform: scale(1)     translateY(0px)  translateX(0px); }
        }
        @keyframes sb-chain-flow {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -40; }
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

      <div className="absolute top-4 left-2 z-20 flex items-center gap-1.5">
        <button
          onClick={() => setConfirmDialog('exit')}
          className="sb-chip"
          style={{ cursor: 'pointer', padding: '5px 11px', fontSize: '11px' }}
        >
          ← FLEE
        </button>
        <button
          onClick={toggleCardInfo}
          title={cardInfoEnabled ? 'Card info ON — click to turn off' : 'Card info OFF — click to turn on'}
          style={{
            width: 32, height: 28,
            borderRadius: 4,
            background: cardInfoEnabled
              ? 'linear-gradient(180deg, #1a3a1a 0%, #0e2010 100%)'
              : 'rgba(0,0,0,0.4)',
            border: `1.5px solid ${cardInfoEnabled ? '#4ade80' : 'rgba(255,255,255,0.15)'}`,
            color: cardInfoEnabled ? '#4ade80' : '#475569',
            fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 200ms, border-color 200ms, color 200ms',
          }}
          aria-pressed={cardInfoEnabled}
          aria-label="Toggle card info popup"
        >📖</button>
      </div>

      <div className="absolute top-4 right-2 z-20 flex flex-col items-end gap-1.5 pointer-events-none">
        <span className="sb-chip sb-chip-gold" style={{ fontSize: '12px' }}>⚡ {runner.state.staminaThisTurn} STAMINA</span>
        <span className="sb-chip">🃏 {runner.state.deck.length} DECK</span>
        <span className="sb-chip" style={{ opacity: 0.75 }}>🗑 {runner.state.discard.length} DISCARD</span>
      </div>

      {/* Enemy row — boss appears larger and centered, flanked by minions. */}
      <div className="absolute z-10 left-0 right-0 flex justify-center items-end gap-3 px-4" style={{ top: 56 }}>
        {runner.state.enemies.map((e, ei) => {
          const isBossEnemy = getEnemy(e.defId)?.archetype === 'boss';
          const w = isBossEnemy ? 189 : 136;
          const h = isBossEnemy ? 265 : 190;
          return EnemyCard({ e, cardW: w, cardH: h, isBossEnemy, enemyIdx: ei });
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
        bottom: 170, height: 280, pointerEvents: 'none',
      }}>
        <div style={{
          position: 'relative',
          width: Math.max(allCardsInHand.length, 1) * 130,
          height: '100%', pointerEvents: 'none',
        }}>
          {allCardsInHand.map((entry, i) =>
            HandCard({
              entry, i, total: allCardsInHand.length,
              cardW: 148, cardH: 207,
              fan: { spacing: 118, arcMul: 1.8, rotMax: 6 },
              isDiscardPicking: pendingDiscard,
              selectedForDiscard: discardPickSelected.has(entry.realIndex),
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
          disabled={animating || isDealing || pendingDiscard}
          style={{
            width: 72, height: 52,
            background: (animating || isDealing || pendingDiscard)
              ? 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)'
              : 'linear-gradient(180deg, #1e3a5f 0%, #0f1e33 100%)',
            border: '2.5px solid #7ec4ff',
            borderRadius: 4,
            color: (animating || isDealing || pendingDiscard) ? '#4a6a8a' : '#7ec4ff',
            fontFamily: 'var(--sb-font-display)',
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            cursor: (animating || isDealing || pendingDiscard) ? 'not-allowed' : 'pointer',
            textShadow: (animating || isDealing || pendingDiscard) ? 'none' : '0 0 8px #7ec4ff80',
            boxShadow: (animating || isDealing || pendingDiscard)
              ? 'none'
              : 'inset 0 1px 0 rgba(126,196,255,0.3), 0 0 16px rgba(126,196,255,0.15)',
            opacity: (animating || isDealing || pendingDiscard) ? 0.5 : 1,
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
          disabled={animating || isDealing || pendingDiscard}
          style={{
            width: 220, height: 52,
            background: (animating || isDealing || pendingDiscard)
              ? 'linear-gradient(180deg, #4a3530 0%, #2a1f15 100%)'
              : 'linear-gradient(180deg, var(--sb-crimson) 0%, var(--sb-crimson-dark) 100%)',
            border: '2.5px solid var(--sb-gold)',
            borderRadius: 4,
            color: (animating || isDealing || pendingDiscard) ? '#8b6238' : 'var(--sb-gold-light)',
            fontFamily: 'var(--sb-font-display)',
            fontSize: 14, fontWeight: 700, letterSpacing: '0.12em',
            cursor: (animating || isDealing || pendingDiscard) ? 'not-allowed' : 'pointer',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            boxShadow: 'inset 0 1px 0 rgba(253,230,138,0.55), inset 0 -1px 0 rgba(0,0,0,0.45), 0 6px 18px rgba(0,0,0,0.6)',
            opacity: (animating || isDealing || pendingDiscard) ? 0.7 : 1,
          }}
        >
          {animating ? '⚔ RESOLVING…' : isDealing ? '✦ DEALING…' : pendingDiscard ? '✦ DISCARD…' : '▶ END TURN'}
        </button>
      </div>

      {/* Discard picker overlay (desktop) */}
      {pendingDiscard && (
        <div className="absolute z-40 sb-fade-up" style={{
          left: '50%', bottom: 420,
          transform: 'translateX(-50%)',
          background: 'linear-gradient(180deg, #2a1810 0%, #1a0f0a 100%)',
          border: '2px solid var(--sb-crimson)',
          borderRadius: 8, padding: '12px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          textAlign: 'center', minWidth: 280,
        }}>
          <div className="sb-display" style={{ fontSize: 13, color: 'var(--sb-gold-light)', letterSpacing: '0.2em', marginBottom: 6 }}>
            CHOOSE {runner.state.pendingDiscardCount} CARD{runner.state.pendingDiscardCount > 1 ? 'S' : ''} TO DISCARD
          </div>
          <div className="sb-mono" style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
            {discardPickSelected.size} / {runner.state.pendingDiscardCount} selected — tap cards in hand
          </div>
          <button
            onClick={handleConfirmDiscard}
            disabled={discardPickSelected.size !== runner.state.pendingDiscardCount}
            className="sb-btn-primary"
            style={{ padding: '7px 24px', fontSize: 12, opacity: discardPickSelected.size !== runner.state.pendingDiscardCount ? 0.45 : 1 }}
          >
            CONFIRM DISCARD
          </button>
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
      {TacticPlayOverlay}
      {ProjectileLayer}
      {ImpactRingLayer}
      {FireballExplosionLayer}
      {SlashLayer}
      {ParticleLayer}
      {FloaterLayer}
      {InfoModal}
      {HandCardPopupLayer}
      {OutcomeAnnounceLayer}
      {ConfirmDialogLayer}
      {BattleIntroOverlay}
    </div>
  );
}

