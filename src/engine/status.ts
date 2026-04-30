// Sigilbound status effects. Pure functions over a `StatusBag` (a record of
// status-id → stacks/turns). Effects fire in three slots:
//
//   - onTurnStart(bag)  → immediate damage/heal applied at start of owner's turn
//   - onTurnEnd(bag)    → DoT-style ticks at end of owner's turn (Burn, Bleed)
//   - decay(bag)        → decrements turnsRemaining; removes effects at 0
//
// Damage modifiers (Weakened reduces dealt damage; Marked amplifies incoming)
// live as small lookups (`outgoingDamageMult`, `incomingDamageMult`) called
// from the damage pipeline.
//
// Stacking rules (per GDD): same status reapplied stacks the duration AND
// stacks (e.g., 3-stack Burn from a fresh hit + 2-stack from old → 5 stacks).
// Frozen is binary: if applied, the next turn's plan phase is skipped
// regardless of stacks.

export type StatusId =
  | 'burn'        // 3 dmg/turn for N turns (Fire signature)
  | 'bleed'       // 4 dmg/turn for N turns (Physical/brute signature)
  | 'poison'      // 2 dmg/turn × stacks (Nature signature)
  | 'frozen'      // skip next plan phase
  | 'chill'       // marker for stacking Ice combos; ≥3 stacks → "skip enemy turn"
  | 'sleep'       // skip N turns; cleared on hit
  | 'stun'        // skip next action (1 turn)
  | 'entangled'   // cannot gain block, -50% speed (Nature signature)
  | 'charmed'     // attacks own side next turn (Holy signature)
  | 'weakened'    // -25% damage dealt for N turns
  | 'empowered'   // +30% damage dealt for N turns (self-buff)
  | 'marked'      // next attack against this entity +50%
  | 'vulnerable'  // takes +50% damage for N turns
  | 'curse'       // -1 stamina (player) / -1 attack (enemy) per turn
  | 'regen'       // +3 HP/turn for N turns
  | 'block'       // soak for damage; resets at end of owner turn (handled by runner)
  | 'hasted';     // +1 charge to all sigils end of turn

export interface StatusInstance {
  stacks: number;          // how many points of this effect (e.g., burn 5 = 5 stacks)
  turnsRemaining: number;  // -1 = permanent; 0 = expired (will be removed on decay)
}

export type StatusBag = Partial<Record<StatusId, StatusInstance>>;

// Per-status metadata used by the runner + UI.
export interface StatusDef {
  id: StatusId;
  icon: string;
  name: string;
  // The stacks of a given status either decay by 1/turn (Burn, Bleed) or only
  // expire when turnsRemaining hits 0 (Marked, Frozen). 'damage' kind decays
  // BOTH stacks AND turns; others decay only turns.
  decayKind: 'turns' | 'damage' | 'permanent';
}

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  burn:       { id: 'burn',       icon: '🔥', name: 'Burn',       decayKind: 'damage' },
  bleed:      { id: 'bleed',      icon: '🩸', name: 'Bleed',      decayKind: 'damage' },
  poison:     { id: 'poison',     icon: '☠️', name: 'Poison',     decayKind: 'damage' },
  frozen:     { id: 'frozen',     icon: '❄️', name: 'Frozen',     decayKind: 'turns' },
  chill:      { id: 'chill',      icon: '🧊', name: 'Chill',      decayKind: 'turns' },
  sleep:      { id: 'sleep',      icon: '💤', name: 'Sleep',      decayKind: 'turns' },
  stun:       { id: 'stun',       icon: '💫', name: 'Stun',       decayKind: 'turns' },
  entangled:  { id: 'entangled',  icon: '🌿', name: 'Entangled',  decayKind: 'turns' },
  charmed:    { id: 'charmed',    icon: '💛', name: 'Charmed',    decayKind: 'turns' },
  weakened:   { id: 'weakened',   icon: '🌀', name: 'Weakened',   decayKind: 'turns' },
  empowered:  { id: 'empowered',  icon: '💪', name: 'Empowered',  decayKind: 'turns' },
  marked:     { id: 'marked',     icon: '👁',  name: 'Marked',     decayKind: 'turns' },
  vulnerable: { id: 'vulnerable', icon: '💥', name: 'Vulnerable', decayKind: 'turns' },
  curse:      { id: 'curse',      icon: '💀', name: 'Curse',      decayKind: 'turns' },
  regen:      { id: 'regen',      icon: '💚', name: 'Regen',      decayKind: 'turns' },
  block:      { id: 'block',      icon: '🛡️', name: 'Block',      decayKind: 'permanent' },
  hasted:     { id: 'hasted',     icon: '⚡', name: 'Hasted',      decayKind: 'turns' },
};

// === Apply / clear ===

export function applyStatus(
  bag: StatusBag,
  id: StatusId,
  stacks: number,
  turns: number,
): StatusBag {
  const cur = bag[id];
  const next: StatusInstance = cur
    ? { stacks: cur.stacks + stacks, turnsRemaining: Math.max(cur.turnsRemaining, turns) }
    : { stacks, turnsRemaining: turns };
  return { ...bag, [id]: next };
}

export function clearStatus(bag: StatusBag, id: StatusId): StatusBag {
  if (!(id in bag)) return bag;
  const next = { ...bag };
  delete next[id];
  return next;
}

export function hasStatus(bag: StatusBag, id: StatusId): boolean {
  const s = bag[id];
  return !!s && s.stacks > 0 && s.turnsRemaining !== 0;
}

export function statusStacks(bag: StatusBag, id: StatusId): number {
  return bag[id]?.stacks ?? 0;
}

// === Tick helpers ===

// Damage from DoT effects at end of owner's turn. Returns total damage and
// the bag with stacks decayed. Does NOT apply HP — caller does.
export function tickDamageOverTime(bag: StatusBag): { damage: number; bag: StatusBag } {
  let damage = 0;
  let next: StatusBag = bag;
  const burn = bag.burn;
  if (burn && burn.stacks > 0) {
    damage += 3 * burn.stacks;
    next = applyStackChange(next, 'burn', -1);
  }
  const bleed = bag.bleed;
  if (bleed && bleed.stacks > 0) {
    damage += 4 * bleed.stacks;
    next = applyStackChange(next, 'bleed', -1);
  }
  const poison = bag.poison;
  if (poison && poison.stacks > 0) {
    damage += 2 * poison.stacks; // 2 dmg per stack (Nature signature)
    next = applyStackChange(next, 'poison', -1);
  }
  return { damage, bag: next };
}

// Heal-over-time from regen.
export function tickHealOverTime(bag: StatusBag): { heal: number; bag: StatusBag } {
  const regen = bag.regen;
  if (!regen || regen.stacks <= 0) return { heal: 0, bag };
  return { heal: 3 * regen.stacks, bag };
}

// Decrement turn counters, drop expired effects. Run at end of turn AFTER
// damage-over-time. Block resets via the runner (it's a `permanent` status
// so this fn leaves it alone — runner zeroes it explicitly).
export function decayStatuses(bag: StatusBag): StatusBag {
  const next: StatusBag = {};
  for (const [k, v] of Object.entries(bag) as Array<[StatusId, StatusInstance]>) {
    if (!v) continue;
    const def = STATUS_DEFS[k];
    if (def.decayKind === 'permanent') {
      // Caller manages these explicitly.
      next[k] = v;
      continue;
    }
    // turnsRemaining = -1 means "infinite until consumed" — keep as-is.
    if (v.turnsRemaining < 0) {
      next[k] = v;
      continue;
    }
    const turnsLeft = v.turnsRemaining - 1;
    if (turnsLeft <= 0 || v.stacks <= 0) {
      // Drop the effect.
      continue;
    }
    next[k] = { stacks: v.stacks, turnsRemaining: turnsLeft };
  }
  return next;
}

// === Damage modifiers ===

// Multiplier applied to damage the owner DEALS.
// Weakened: -25%. Empowered: +30%. Stack multiplicatively.
export function outgoingDamageMult(bag: StatusBag): number {
  let m = 1;
  if (hasStatus(bag, 'weakened'))  m *= 0.75;
  if (hasStatus(bag, 'empowered')) m *= 1.30;
  return m;
}

// Returns true if the entity is unable to act this turn (sleep, stun, frozen, charmed).
export function isSkippingTurn(bag: StatusBag): boolean {
  return hasStatus(bag, 'sleep') || hasStatus(bag, 'stun') || hasStatus(bag, 'frozen') || hasStatus(bag, 'charmed');
}

// Called when a sleeping entity is hit — clears sleep immediately.
export function clearSleepOnHit(bag: StatusBag): StatusBag {
  if (!hasStatus(bag, 'sleep')) return bag;
  return clearStatus(bag, 'sleep');
}

// Returns true if the entity cannot gain block (entangled).
export function isEntangled(bag: StatusBag): boolean {
  return hasStatus(bag, 'entangled');
}

// Multiplier applied to damage the owner RECEIVES. Marked = +50% next hit
// (consumed on use; runner clears it). Vulnerable = +50% for the duration.
export function incomingDamageMult(bag: StatusBag, options: { consumeMarked?: boolean } = {}): {
  mult: number; bag: StatusBag;
} {
  let mult = 1;
  let next: StatusBag = bag;
  if (hasStatus(bag, 'marked')) {
    mult *= 1.5;
    if (options.consumeMarked) next = clearStatus(next, 'marked');
  }
  if (hasStatus(bag, 'vulnerable')) {
    mult *= 1.5;
  }
  return { mult, bag: next };
}

// === Internal helpers ===

function applyStackChange(bag: StatusBag, id: StatusId, delta: number): StatusBag {
  const cur = bag[id];
  if (!cur) return bag;
  const stacks = Math.max(0, cur.stacks + delta);
  if (stacks === 0) {
    return clearStatus(bag, id);
  }
  return { ...bag, [id]: { stacks, turnsRemaining: cur.turnsRemaining } };
}
